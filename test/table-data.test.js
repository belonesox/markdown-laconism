const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { parseOptions } = require('../table-data');
const imageAlt = require('../image-alt');

test('table selectors survive both markdown-it image token layouts', () => {
    const label = 'rows=0:3, cols=0:2';
    const children = [{ type: 'text', content: 'rows=0:3, ' }, { type: 'text', content: 'cols=0:2' }];
    for (const content of [label, '']) {
        const image = { content, children, attrGet: () => '' };
        const options = parseOptions(imageAlt(image), true);
        assert.deepEqual([options.rows, options.cols], ['0:3', '0:2']);
    }
    assert.equal(imageAlt({ content: '', children: [], attrGet: () => '' }), '');
});

async function fixture(t) {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'laconism-test-'));
    t.after(() => fs.rm(dir, { recursive: true, force: true }));
    return dir;
}

function read(file, alt = '') {
    const options = parseOptions(alt, file.endsWith('.xlsx'));
    const worker = new Worker(require.resolve('../table-data'), { workerData: { tableFile: file, options } });
    return new Promise((resolve, reject) => {
        worker.once('message', ({ data, error }) => error ? reject(Error(error)) : resolve(data));
        worker.once('error', reject);
    });
}

test('CSV slices use logical records and preserve row and column order', async t => {
    const file = path.join(await fixture(t), 'data.csv');
    await fs.writeFile(file, '\uFEFFa;b;c\r\n1;2;"3\r\n4"\r\n5;6\r\n7;8;"say ""hi"""\r\n');
    const selected = await read(file, 'sep=semicolon, rows=0;-2:;1:3, cols=-1;0');
    assert.deepEqual(selected, {
        rows: [0, 2, 3, 1],
        cells: [['c', 'a'], ['', '5'], ['say "hi"', '7'], ['3\r\n4', '1']]
    });
    assert.deepEqual((await read(file, 'rows=20:25, sep=semicolon')).rows, []);
    await assert.rejects(read(file, 'cols=12, sep=semicolon'), /outside axis/);
});

test('named tab and double quote delimiters', async t => {
    const file = path.join(await fixture(t), 'data.csv');
    for (const [name, sep] of [['tab', '\t'], ['dblquote', '"']]) {
        await fs.writeFile(file, ['a', '001', 'b'].join(sep));
        assert.deepEqual((await read(file, 'sep=' + name)).cells, [['a', '001', 'b']]);
    }
});

test('XLSX sheet names, formatted values and absent formula results', async t => {
    const { Workbook } = require('exceljs');
    const file = path.join(await fixture(t), 'data.xlsx');
    const book = new Workbook();
    book.addWorksheet('First').addRow(['default']);
    const sheet = book.addWorksheet('Prices, EUR');
    sheet.addRow([0.125, { formula: '2-2', result: 0 }, { formula: '2+2' }]);
    sheet.getCell('A1').numFmt = '0.0%';
    sheet.getCell('A1').font = { italic: true };
    await book.xlsx.writeFile(file);

    assert.deepEqual((await read(file)).cells, [['default']]);
    const alt = 'sheet="Prices, EUR"';
    assert.deepEqual((await read(file, alt)).cells, [['12.5%', '0', '⁇']]);
    assert.equal((await read(file, alt + ', styles')).cells[0][0].italic, true);
    await assert.rejects(read(file, 'sheet=missing'), /Available sheets: First, Prices, EUR/);
});
