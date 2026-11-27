const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');
const vscode = require('vscode');
const { parseOptions } = require('./table-data');
const { isTextCandidate, textOptions, readText, selectText } = require('./text-include');
const { localFragment, findFragment } = require('./text-fragments');
const imageAlt = require('./image-alt');

function stamp(file) {
    try {
        const s = fs.statSync(file);
        return `${s.mtimeMs}/${s.ctimeMs}/${s.size}`;
    } catch {
        return '';
    }
}

function resolveSource(src, env) {
    const doc = env.currentDocument || vscode.window.activeTextEditor?.document.uri;
    if (!doc?.fsPath) throw Error('Cannot resolve the path without a Markdown document.');
    const root = vscode.workspace.getWorkspaceFolder(doc)?.uri.fsPath;
    const source = decodeURIComponent(src);
    const file = source.startsWith('/') && root
        ? path.join(root, source) : path.resolve(path.dirname(doc.fsPath), source);
    return { file, root };
}

function publishedPath(src, file, env) {
    if (!env.topLevelDir || src.startsWith('/')) return src;
    const relative = path.relative(env.topLevelDir, file).split(path.sep).map(encodeURIComponent).join('/');
    return relative.startsWith('../') ? relative : './' + relative;
}

function dirtyDocument(file) {
    return vscode.workspace.textDocuments.find(doc => doc.isDirty && doc.uri.fsPath === file);
}

function lineColumn(text, offset) {
    const lines = text.slice(0, offset).split(/\r\n|[\r\n]/);
    return lines.length + ',' + (lines[lines.length - 1].length + 1);
}

// Code 1.105 (including code-server) understands #Lline,column. Newer Markdown
// previews also accept a range. Keep a working start position on older clients.
const [codeMajor, codeMinor] = vscode.version.split('.').map(Number);
const supportsPreviewRanges = codeMajor > 1 || codeMinor >= 140;

function cellHtml(cell, tag, scope, escape) {
    let attrs = scope ? ` scope="${scope}"` : '';
    let text = cell;
    if (typeof cell === 'object') {
        text = cell.text;
        const css = [];
        if (cell.bold) css.push('font-weight:bold');
        if (cell.italic) css.push('font-style:italic');
        if (['left', 'right', 'center', 'justify'].includes(cell.align)) css.push('text-align:' + cell.align);
        for (const [property, color] of [['color', cell.color], ['background-color', cell.background]]) {
            if (/^(?:[\da-f]{2})?[\da-f]{6}$/i.test(color)) css.push(property + ':#' + color.slice(-6));
        }
        if (css.length) attrs += ` style="${css.join(';')}"`;
    }
    if (typeof text !== 'string') throw Error('Invalid cached cell');
    return `<${tag}${attrs}>${escape(text).replace(/\r\n?|\n/g, '<br>')}</${tag}>`;
}

function tableHtml({ rows, cells }, options, escape) {
    if (rows.length !== cells.length) throw Error('Invalid cached rows');
    if (!rows.length || !cells[0].length) return '<p>Empty table selection.</p>';
    const header = options.header === 'first' ? rows.indexOf(0) : -1;
    const lines = [];
    const height = options.trans ? cells[0].length : rows.length;
    const width = options.trans ? rows.length : cells[0].length;
    for (let i = 0; i < height; i++) {
        const line = [];
        for (let j = 0; j < width; j++) {
            const row = options.trans ? j : i;
            const col = options.trans ? i : j;
            const scope = row === header ? (options.trans ? 'row' : 'col') : '';
            line.push(cellHtml(cells[row][col], scope ? 'th' : 'td', scope, escape));
        }
        lines.push('<tr>' + line.join('') + '</tr>');
    }
    const head = !options.trans && header === 0 ? '<thead>' + lines.shift() + '</thead>' : '';
    return head + '<tbody>' + lines.join('') + '</tbody>';
}

function readInWorker(file, options) {
    const worker = new Worker(require.resolve('./table-data'), { workerData: { tableFile: file, options } });
    const result = new Promise((resolve, reject) => {
        worker.once('message', message => message.error ? reject(Error(message.error)) : resolve(message.data));
        worker.once('error', reject);
        worker.once('exit', code => reject(Error(`Table reader exited (${code})`)));
    });
    return { worker, result };
}

function cacheWrite(file, stamp, data) {
    const temp = file + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
    try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(temp, JSON.stringify({ stamp, data }), { flag: 'wx' });
        fs.renameSync(temp, file);
    } finally {
        try { fs.unlinkSync(temp); } catch { /* Already renamed or read-only workspace. */ }
    }
}

// Only keep and poll selections referenced by open Markdown documents.
function createFilePreview(context) {
    const documents = new Map();
    const entries = new Map();
    let queue = Promise.resolve();
    let timer, pendingRefresh, activeWorker;
    function refresh() {
        clearTimeout(pendingRefresh);
        pendingRefresh = setTimeout(() => {
            vscode.commands.executeCommand('markdown.preview.refresh').then(undefined, console.error);
        }, 80);
    }
    function prune() {
        const active = new Set();
        for (const keys of documents.values()) for (const key of keys) active.add(key);
        for (const key of entries.keys()) if (!active.has(key)) entries.delete(key);
        if (!entries.size) {
            clearInterval(timer);
            timer = undefined;
        }
    }
    function poll() {
        const stamps = new Map();
        for (const entry of entries.values()) {
            if (!stamps.has(entry.file)) stamps.set(entry.file, stamp(entry.file));
            const observed = entry.fragment ? stamps.get(entry.file) + '/' + (dirtyDocument(entry.file)?.version || 0) : stamps.get(entry.file);
            if (observed !== entry.observed) {
                entry.observed = observed;
                refresh();
            }
        }
    }
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(doc => {
        if (documents.delete(doc.uri.toString())) prune();
    }), { dispose() {
        entries.clear();
        documents.clear();
        clearInterval(timer);
        clearTimeout(pendingRefresh);
        activeWorker?.terminate();
    } });

    function renderTable(file, alt, root, refs, escape) {
        const options = parseOptions(alt, /\.xlsx$/i.test(file));
        const key = JSON.stringify([1, root, file, options]);
        refs.add(key);
        const signature = stamp(file);
        let entry = entries.get(key);
        if (entry && entry.stamp === signature) return entry.html;
        entry = { file, stamp: signature, observed: signature };
        entries.set(key, entry);
        const errorText = msg => '<p role="alert">' + escape(path.basename(file) + ' — ' + msg) + '</p>';
        if (!signature) {
            entry.html = errorText('File is missing or unreadable.');
            return entry.html;
        }
        const cached = root && path.join(root, '.vscode', '.cache', 'md-laconism',
            crypto.createHash('sha256').update(key).digest('hex') + '.json');
        if (cached) {
            try {
                const saved = JSON.parse(fs.readFileSync(cached, 'utf8'));
                if (saved.stamp === signature) {
                    entry.html = tableHtml(saved.data, options, escape);
                    return entry.html;
                }
            } catch { /* A missing or damaged cache is rebuilt from the source. */ }
        }
        entry.html = '<p>Loading ' + escape(path.basename(file)) + '…</p>';
        queue = queue.then(async () => {
            if (entries.get(key) !== entry) return;
            try {
                const { worker, result } = readInWorker(file, options);
                activeWorker = worker;
                const data = await result;
                if (entries.get(key) !== entry || stamp(file) !== signature) return;
                entry.html = tableHtml(data, options, escape);
                if (cached) {
                    try { cacheWrite(cached, signature, data); } catch { /* Memory cache still works. */ }
                }
            } catch (e) {
                entry.html = errorText(e.message);
            } finally {
                activeWorker = undefined;
                if (entries.get(key) === entry) refresh();
            }
        });
        return entry.html;
    }

    function cachedText(file, options, refs) {
        const key = JSON.stringify([file, options.rows, options.cols]);
        refs.add(key);
        const signature = stamp(file);
        let entry = entries.get(key);
        if (!entry || entry.stamp !== signature) {
            entry = { file, stamp: signature, observed: signature };
            entries.set(key, entry);
            try {
                entry.text = readText(file, options);
            } catch (error) {
                entry.error = error;
            }
        }
        if (entry.error) throw entry.error;
        return entry.text;
    }

    function fragmentTarget(file, directive, refs) {
        const key = JSON.stringify(['fragment', file, directive]);
        refs.add(key);
        const doc = dirtyDocument(file);
        const signature = stamp(file) + '/' + (doc?.version || 0);
        let entry = entries.get(key);
        if (!entry || entry.stamp !== signature) {
            entry = { file, fragment: true, stamp: signature, observed: signature };
            entries.set(key, entry);
            try {
                const text = doc ? doc.getText() : readText(file);
                if (text === null) throw Error('Text fragments require a text file.');
                const match = findFragment(text, directive);
                const start = lineColumn(text, match.start);
                const end = lineColumn(text, match.end);
                entry.target = {
                    content: text.slice(match.start, match.end),
                    location: '#L' + start + (supportsPreviewRanges ? '-L' + end : ''),
                    ambiguous: match.ambiguous
                };
            } catch (error) {
                entry.error = error;
            }
        }
        if (entry.error) throw entry.error;
        return entry.target;
    }

    return function install(md) {
        md.core.ruler.after('inline', 'laconism_file_blocks', state => {
            const tokens = state.tokens;
            for (let i = 0; i + 2 < tokens.length; ++i) {
                const [open, inline, close] = [tokens[i], tokens[i + 1], tokens[i + 2]];
                if (open.type !== 'paragraph_open' || inline.type !== 'inline' || close.type !== 'paragraph_close') continue;
                if (inline.children?.length !== 1 || inline.children[0].type !== 'image') continue;
                const image = inline.children[0];
                const src = image.attrGet('src');
                if (!src || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(src)) continue;
                const alt = imageAlt(image);
                const fragment = localFragment(src);
                if (!fragment && /\.md$/i.test(src)) {
                    // A standalone transcluded Markdown document already supplies its own blocks.
                    open.hidden = close.hidden = true;
                } else if (!fragment && /\.(csv|xlsx)$/i.test(src)) {
                    open.type = 'laconism_table';
                    open.tag = 'table';
                    open.nesting = 0;
                    open.hidden = false;
                    open.meta = { src, alt };
                    tokens.splice(i + 1, 2);
                } else if (isTextCandidate(fragment?.src || src, alt) && !/\.(?:csv|xlsx|md)$/i.test(fragment?.src || '')) {
                    // Keep the image paragraph available for binary files and capture the
                    // source before nested Markdown adjusts image paths for the webview.
                    open.meta = { ...open.meta, textInclude: { src: fragment?.src || src, alt, fragment } };
                }
            }
        });

        md.renderer.rules.laconism_table = (tokens, idx, options, env, self) => {
            const token = tokens[idx];
            const { src, alt } = token.meta;
            try {
                const { file, root } = resolveSource(src, env);
                const body = renderTable(file, alt, root, env.laconismFiles, md.utils.escapeHtml);
                if (body.startsWith('<p')) return body + '\n';
                return '<table' + self.renderAttrs(token) + '>' + body + '</table>\n';
            } catch (e) {
                return '<p role="alert">' + md.utils.escapeHtml(src + ' — ' + e.message) + '</p>\n';
            }
        };

        const previousLink = md.renderer.rules.link_open || ((ts, i, o, e, self) => self.renderToken(ts, i, o));
        md.renderer.rules.link_open = (ts, i, o, env, self) => {
            const token = ts[i];
            const href = token.attrGet('href') || '';
            const fragment = localFragment(href);
            const codePath = token.meta?.codePath;
            if ((!fragment && !codePath) || !env?.laconismFiles) return previousLink(ts, i, o, env, self);
            const copy = Object.assign(new token.constructor(token.type, token.tag, token.nesting), token, {
                attrs: token.attrs.map(attr => attr.slice())
            });
            const pathPart = href.split(/[?#]/, 1)[0];
            const suffix = href.slice(pathPart.length);
            try {
                // In a transcluded document both destinations are relative to the host.
                const file = (fragment || env.topLevelDir) && resolveSource(pathPart, env).file;
                const src = publishedPath(pathPart, file, env);
                const published = codePath ? src.replace(/\.md$/i, '.html') : src;
                copy.attrSet('href', published + suffix);
                copy.attrSet('data-href', src + suffix);
                if (fragment) {
                    const target = fragmentTarget(file, fragment.directive, env.laconismFiles);
                    copy.attrSet('data-href', src + target.location);
                    if (target.ambiguous) copy.attrSet('title', 'Multiple matches — opens the first one.');
                }
            } catch (error) {
                copy.attrSet('title', error.message);
            }
            // Isolate changes from the token cache and keep the rest of the renderer chain.
            const original = ts[i];
            ts[i] = copy;
            try { return previousLink(ts, i, o, env, self); } finally { ts[i] = original; }
        };

        md.renderer.rules.laconism_source_open = (tokens, i) => {
            const { href, ideHref, name, title } = tokens[i].meta;
            const escape = md.utils.escapeHtml;
            return '<div class="laconism-source-block"><div style="text-align:right;font-size:0.8em">' +
                '<a href="' + escape(href) + '" data-href="' + escape(ideHref) + '" title="' + escape(title) + '">' +
                escape(name) + ' ↗</a></div>\n';
        };
        md.renderer.rules.laconism_source_close = () => '</div>\n';

        function expandText(tokens, env) {
            const result = [];
            for (let i = 0; i < tokens.length; i++) {
                const open = tokens[i];
                const include = open.meta?.textInclude;
                if (!include) {
                    result.push(open);
                    continue;
                }
                const block = new open.constructor('fence', 'code', 0);
                block.block = true;
                block.map = open.map;
                block.level = open.level;
                block.attrs = open.attrs?.map(attr => attr.slice()) || null;
                try {
                    const { file } = resolveSource(include.src, env);
                    const options = textOptions(file, include.alt);
                    const target = include.fragment && fragmentTarget(file, include.fragment.directive, env.laconismFiles);
                    const content = target ? selectText(() => [target.content], options) : cachedText(file, options, env.laconismFiles);
                    if (content === null) {
                        result.push(open);
                        continue;
                    }
                    block.markup = '```';
                    block.info = options.language;
                    block.content = content;
                    if (options.sourceLink) {
                        const src = publishedPath(include.src, file, env);
                        const wrapper = new open.constructor('laconism_source_open', 'div', 1);
                        wrapper.meta = {
                            name: decodeURI(include.src),
                            href: src + (target ? '#:~:text=' + include.fragment.directive : ''),
                            ideHref: src + (target?.location || ''),
                            title: target?.ambiguous ? 'Open source (first of several matches)' : 'Open source'
                        };
                        result.push(wrapper, block, new open.constructor('laconism_source_close', 'div', -1));
                        i += 2;
                        continue;
                    }
                } catch (error) {
                    block.type = 'html_block';
                    block.content = '<p role="alert">' + md.utils.escapeHtml(include.src + ' — ' + error.message) + '</p>\n';
                }
                result.push(block);
                i += 2; // The fence replaces paragraph_open, inline and paragraph_close.
            }
            return result;
        }

        const previous = md.renderer.render;
        md.renderer.render = function(tokens, options, env = {}) {
            const refs = env.laconismFiles || new Set();
            const scope = { ...env, laconismFiles: refs, laconismGit: env.laconismGit || new Map() };
            const html = previous.call(this, expandText(tokens, scope), options, scope);
            if (env.laconismFiles) return html;
            const uri = env.currentDocument || vscode.window.activeTextEditor?.document.uri;
            if (uri && (refs.size || documents.has(uri.toString()))) {
                if (refs.size) documents.set(uri.toString(), refs);
                else documents.delete(uri.toString());
                prune();
                if (entries.size && !timer) timer = setInterval(poll, 2000);
            }
            return html;
        };
    };
}

module.exports = { createFilePreview };
