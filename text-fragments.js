// Split directive delimiters before decoding: %2C, %26 and %2D can be literal text.
function localFragment(href) {
    const marker = '#:~:text=';
    const index = href.indexOf(marker);
    if (index < 1) return;
    const src = href.slice(0, index);
    if (/^[a-z][\w+.-]*:|^[/\\]{2}|[?#]/i.test(src)) return;
    return { src, directive: href.slice(index + marker.length) };
}

function parseDirective(raw) {
    if (raw.includes('&')) throw Error('Use one text directive per source link.');
    const terms = raw.split(',');
    let prefix, suffix;
    if (terms.length > 1 && terms[0].endsWith('-')) prefix = terms.shift().slice(0, -1);
    if ((prefix !== undefined || terms.length > 1) && terms[terms.length - 1].startsWith('-')) suffix = terms.pop().slice(1);
    if (!terms.length) throw Error('Missing start term in text fragment.');
    if (terms.length > 2) throw Error('Expected text=start or text=start,end. Encode literal commas as %2C.');
    const decode = term => {
        if (term === undefined) return;
        const text = decodeURIComponent(term).trim();
        if (!text) throw Error('Empty term in text fragment.');
        return text;
    };
    return { start: decode(terms[0]), end: decode(terms[1]), prefix: decode(prefix), suffix: decode(suffix) };
}

function pattern(term) {
    return term.split(/\s+/u).map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
}

// Keep offsets in the original UTF-16 string for VS Code and for extracting verbatim code.
function findFragment(text, directive) {
    const { start, end, prefix, suffix } = parseDirective(directive);
    const word = '[\\p{L}\\p{N}\\p{M}_]';
    const wordStart = term => /^[\p{L}\p{N}\p{M}_]/u.test(term) ? '(?<!' + word + ')' : '';
    const wordEnd = term => /[\p{L}\p{N}\p{M}_]$/u.test(term) ? '(?!' + word + ')' : '';
    const before = prefix ? '(?<=' + wordStart(prefix) + pattern(prefix) + '\\s*)' : wordStart(start);
    const after = suffix ? '(?=\\s*' + pattern(suffix) + wordEnd(suffix) + ')' : wordEnd(end || start);
    const starts = new RegExp(before + pattern(start) + (end ? wordEnd(start) : after), 'giu');
    const ends = end && new RegExp(wordStart(end) + pattern(end) + after, 'giu');
    let first;
    for (const match of text.matchAll(starts)) {
        let stop = match.index + match[0].length;
        if (ends) {
            ends.lastIndex = stop;
            if (!ends.exec(text)) break;
            stop = ends.lastIndex;
        }
        if (first) return { ...first, ambiguous: true };
        first = { start: match.index, end: stop, ambiguous: false };
    }
    if (!first) throw Error('Text fragment not found: ' + start + (end ? ' … ' + end : ''));
    return first;
}

function editorLinks(markdown) {
    if (!markdown.includes('#:~:text=')) return [];
    const { parser } = require('@lezer/markdown');
    const links = [];
    parser.parse(markdown).iterate({ enter(item) {
        if (item.name !== 'Link' && item.name !== 'Image') return;
        const node = item.node;
        const url = node.getChild('URL');
        if (!url) return;
        const href = markdown.slice(url.from, url.to).replace(/^<([\s\S]*)>$/, '$1')
            .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])/g, '$1');
        if (!localFragment(href)) return;
        const [open, close] = node.getChildren('LinkMark');
        if (!close) return;
        // Supply both click targets. The built-in Markdown link on the URL opens
        // the file but does not resolve its text directive.
        const empty = close.from === open.to;
        links.push({ from: empty ? open.from : open.to, to: empty ? close.to : close.from, href });
        links.push({ from: url.from, to: url.to, href });
    } });
    return links.sort((a, b) => a.from - b.from);
}

module.exports = { localFragment, findFragment, editorLinks };
