const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isTextCandidate, textOptions, readText } = require('../text-include');

function fixture(t, bytes) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'laconism-text-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, 'source');
    fs.writeFileSync(file, bytes);
    return file;
}

test('defaults, overrides and reserved media', () => {
    assert.equal(textOptions('DIAGRAM.PY', '').language, 'python');
    assert.equal(textOptions('diagram.py', 'type=text').language, '');
    assert.equal(textOptions('diagram.generated', 'type=mermaid').language, 'mermaid');
    assert.equal(textOptions('example', '').language, '');
    assert.equal(isTextCandidate('drawing.SVG', 'type=text'), false);
    assert.equal(isTextCandidate('video.webm', ''), false);
    assert.equal(isTextCandidate('share', 'right,qrcode'), false);
});

test('UTF-8 spanning a read boundary preserves every character', t => {
    const source = ' '.repeat(65535) + 'ж\n\t<em>\n\n```';
    assert.equal(readText(fixture(t, source)), source);
    assert.equal(readText(fixture(t, '')), '');
    assert.equal(readText(fixture(t, Buffer.from('\uFEFFпример\r\n', 'utf16le'))), 'пример\r\n');
});

test('binary bytes disqualify the whole file, including after the prefix', t => {
    for (const byte of [0, 0xff]) {
        assert.equal(readText(fixture(t, Buffer.concat([Buffer.alloc(65536, 32), Buffer.from([byte])]))), null);
    }
});

test('rows, cols and type can appear in any order and share table slice syntax', t => {
    const file = fixture(t, 'head\r\n\n😀abc\rcafé\nlast');
    const options = textOptions(file, 'cols=-1;0:2, type=text, rows=-1;0;2:5;0');
    assert.equal(options.language, '');
    assert.equal(readText(file, options), 'tla\ndhe\r\nc😀a\réca\n');
    assert.equal(readText(file, textOptions(file, 'rows=1:2, type=yaml')), '\n');
    assert.equal(readText(file, textOptions(file, 'rows=20:30')), '');
    assert.throws(() => readText(file, textOptions(file, 'rows=5')), /outside axis/);
    assert.throws(() => textOptions(file, 'type=text, cols=0::2'), /Invalid cols/);
});

test('cols work per line, including blank lines, short lines and tabs', t => {
    const file = fixture(t, 'a\r\n\n\t😺b\r');
    assert.equal(readText(file, textOptions(file, 'cols=1;0')), 'a\r\n\n😺\t\r');
    assert.equal(readText(file, textOptions(file, 'cols=-1')), 'a\r\n\nb\r');
    assert.throws(() => readText(file, textOptions(file, 'rows=3')), /outside axis/);
});

test('large omitted rows, split CRLF, UTF-16 and late binary data', t => {
    const file = fixture(t, 'a'.repeat(65535) + '\r\n' + 'z'.repeat(4 * 1024 * 1024) + '\rlast\n');
    assert.equal(readText(file, textOptions(file, 'rows=-1;0, cols=1:3')), 'as\naa\r\n');
    const utf16 = fixture(t, Buffer.from('\uFEFFнулевая\r\n😀строка\r\n', 'utf16le'));
    assert.equal(readText(utf16, textOptions(utf16, 'rows=-1, cols=0;2')), '😀т\r\n');
    fs.appendFileSync(file, Buffer.from([0xff]));
    assert.equal(readText(file, textOptions(file, 'rows=0:1')), null);
});
