const fs = require('fs');
const path = require('path');
const { TextDecoder } = require('util');

const { argumentsOf, selection, selectIndices } = require('./include-options');

const media = /\.(?:apng|avif|bmp|cur|gif|heic|heif|ico|jfif|jpe?g|jxl|png|svgz?|tiff?|webp|xbm|xpm|pbm|pgm|ppm|mp4|m4v|webm|og[gv]|mov|avi|mkv|mpg|mpeg|flv|wmv|mp3|wav|ogg|flac|m4a|aac|pdf|xls)$/i;

const languages = new Map(Object.entries({
    py: 'python', pyw: 'python', pyi: 'python', js: 'javascript', mjs: 'javascript',
    cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', cxx: 'cpp', cc: 'cpp', hpp: 'cpp', cs: 'csharp',
    go: 'go', rs: 'rust', rb: 'ruby', php: 'php', kt: 'kotlin', swift: 'swift',
    sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', sql: 'sql',
    json: 'json', jsonc: 'jsonc', yml: 'yaml', yaml: 'yaml', toml: 'toml',
    ini: 'ini', xml: 'xml', html: 'html', htm: 'html', css: 'css', scss: 'scss',
    diff: 'diff', patch: 'diff', mmd: 'mermaid', mermaid: 'mermaid'
}));

function isTextCandidate(src, alt) {
    return !/[?#]/.test(src) && !media.test(src) && !/(?:^|[\s,])qrcode(?:$|[\s,])/i.test(alt);
}

function defaultLanguage(file) {
    const name = path.basename(file).toLowerCase();
    if (name === 'makefile') return 'makefile';
    if (name === 'dockerfile') return 'dockerfile';
    return languages.get(path.extname(name).slice(1)) || '';
}

function textOptions(file, alt) {
    const options = { language: defaultLanguage(file), rows: ':', cols: ':' };
    // An ordinary image description has never been required to be an option list.
    if (!/(?:^|,)\s*(?:type|rows|cols)\s*=/i.test(alt)) return options;
    for (const [name, value] of argumentsOf(alt, 'text')) {
        const key = name.toLowerCase();
        if (key === 'rows' || key === 'cols') {
            options[key] = selection(key, value);
        } else if (key === 'type' && value && /^[\w.+#-]+$/.test(value)) {
            options.language = value.toLowerCase() === 'text' ? '' : value;
        } else {
            throw Error(`Invalid text option: ${name}${value === undefined ? '' : '=' + value}`);
        }
    }
    return options;
}

class BinaryFile extends Error {}

function* textChunks(fd) {
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    let decoder;
    let pendingCR = '';
    while (true) {
        const size = fs.readSync(fd, buffer, 0, buffer.length, position);
        position += size;
        if (!decoder) {
            const bom = size >= 2 ? buffer.readUInt16BE(0) : 0;
            const encoding = bom === 0xfffe ? 'utf-16le' : bom === 0xfeff ? 'utf-16be' : 'utf-8';
            decoder = new TextDecoder(encoding, { fatal: true });
        }
        let text = pendingCR + decoder.decode(buffer.subarray(0, size), { stream: size > 0 });
        if (/[\x00-\x08\x0b\x0e-\x1f\x7f]/.test(text)) throw new BinaryFile();
        // Keep CRLF together even across reads. A standalone CR at EOF still counts.
        pendingCR = size && text.endsWith('\r') ? '\r' : '';
        if (pendingCR) text = text.slice(0, -1);
        if (text) yield text;
        if (!size) break;
    }
}

function lineCount(fd) {
    let endings = 0;
    let unterminated = false;
    for (const chunk of textChunks(fd)) {
        const separators = /\r\n|[\r\n]/g;
        while (separators.test(chunk)) endings++;
        unterminated = !/[\r\n]$/.test(chunk);
    }
    return endings + Number(unterminated);
}

// Only assemble lines needed for the excerpt. An omitted row can span many chunks.
function* selectedLines(fd, positions) {
    let row = 0;
    let parts = [];
    for (const chunk of textChunks(fd)) {
        let start = 0;
        for (const match of chunk.matchAll(/\r\n|[\r\n]/g)) {
            if (!positions || positions.has(row)) {
                parts.push(chunk.slice(start, match.index));
                yield [row, parts.join(''), match[0]];
                parts = [];
            }
            start = match.index + match[0].length;
            row++;
        }
        if (start < chunk.length && (!positions || positions.has(row))) parts.push(chunk.slice(start));
    }
    if (parts.length) yield [row, parts.join(''), ''];
}

function selectedColumns(line, cols) {
    if (cols === ':') return line;
    // JS strings index UTF-16 units. Use code points when supplementary characters occur.
    const chars = /[\uD800-\uDBFF]/.test(line) ? Array.from(line) : line;
    return selectIndices(cols, chars.length, true).map(i => chars[i]).join('');
}

function readText(file, { rows = ':', cols = ':' } = {}) {
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK);
    try {
        if (!fs.fstatSync(fd).isFile()) throw Error('Expected a regular file.');
        if (rows === ':' && cols === ':') return [...textChunks(fd)].join('');

        let positions;
        if (rows !== ':') {
            // Count and validate the whole source once, including bytes beyond the excerpt.
            const indices = selectIndices(rows, lineCount(fd));
            positions = new Map(indices.map((row, slot) => [row, slot]));
            if (!positions.size) return '';
        }
        const output = [];
        let remaining = positions?.size;
        for (const [row, line, ending] of selectedLines(fd, positions)) {
            const slot = positions ? positions.get(row) : output.length;
            // A reordered unterminated final line needs a separator before its successor.
            const separator = ending || (positions && slot + 1 < positions.size ? '\n' : '');
            output[slot] = selectedColumns(line, cols) + separator;
            if (positions && --remaining === 0) break;
        }
        return output.join('');
    } catch (e) {
        if (e instanceof BinaryFile || e.code === 'ERR_ENCODING_INVALID_ENCODED_DATA') return null;
        throw e;
    } finally {
        fs.closeSync(fd);
    }
}

module.exports = { isTextCandidate, textOptions, readText };
