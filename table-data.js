// Read the workbook or CSV in a worker so a cold cache cannot block the editor.
const fs = require('fs');
const { parentPort, workerData } = require('worker_threads');

const { argumentsOf, selection, selectIndices } = require('./include-options');

const delimiters = { comma: ',', semicolon: ';', tab: '\t', dblquote: '"' };

function parseOptions(alt, excel) {
    const options = { rows: ':', cols: ':', header: 'first', trans: false, styles: false };
    for (const [key, value] of argumentsOf(alt, 'table')) {
        if (key === 'trans' || (excel && key === 'styles')) {
            if (value !== undefined) throw Error(`${key} takes no value`);
            options[key] = true;
        } else if (key === 'rows' || key === 'cols') {
            options[key] = selection(key, value);
        } else if ((key === 'header' && ['first', 'none'].includes(value)) ||
                   (key === 'sep' && !excel && Object.prototype.hasOwnProperty.call(delimiters, value)) ||
                   (key === 'sheet' && excel && value)) {
            options[key] = value;
        } else {
            throw Error(`Unknown table option or value: ${value === undefined ? key : key + '=' + value}`);
        }
    }
    return options;
}

async function csvRecords(file, options, visit) {
    const { parse } = require('csv-parse');
    const delimiter = delimiters[options.sep || 'comma'];
    const parser = parse({ delimiter, quote: delimiter === '"' ? false : '"', bom: true, relax_column_count: true });
    const input = fs.createReadStream(file);
    input.on('error', err => parser.destroy(err));
    input.pipe(parser);
    try {
        let i = 0;
        for await (const row of parser) visit(row, i++);
    } finally {
        input.destroy();
        parser.destroy();
    }
}

async function readCsv(file, options) {
    // Count logical records first. Negative slices and ragged rows then work
    // without retaining the entire file in memory.
    let height = 0, width = 0;
    await csvRecords(file, options, row => {
        height++;
        width = Math.max(width, row.length);
    });
    const rows = selectIndices(options.rows, height);
    const cols = selectIndices(options.cols, width);
    const selected = new Set(rows);
    const records = new Map();
    await csvRecords(file, options, (row, index) => {
        if (selected.has(index)) records.set(index, cols.map(col => row[col] ?? ''));
    });
    return { rows, cells: rows.map(i => records.get(i)) };
}

function spreadsheetCell(cell, styles, date1904, formulaType) {
    const isFormula = cell.type === formulaType;
    const value = isFormula ? cell.result : cell.value;
    let text;
    if (value == null) {
        text = isFormula ? '⁇' : '';
    } else if (typeof value === 'number' || value instanceof Date) {
        const numeric = value instanceof Date ? value.getTime() / 86400000 + 25569 - (date1904 ? 1462 : 0) : value;
        try {
            text = require('ssf').format(cell.numFmt || 'General', numeric, { date1904 });
        } catch {
            text = value instanceof Date ? value.toISOString() : String(value);
        }
    } else if (value.richText) {
        text = value.richText.map(run => run.text).join('');
    } else {
        text = String(value.error ?? value.text ?? value);
    }
    if (!styles) return text;
    const fill = cell.fill;
    return {
        text, bold: cell.font?.bold, italic: cell.font?.italic, align: cell.alignment?.horizontal,
        color: cell.font?.color?.argb, background: fill?.pattern === 'solid' ? fill.fgColor?.argb : undefined
    };
}

async function readExcel(file, options) {
    // The bundled reader keeps the VSIX independent of ExcelJS's Node stream writers.
    const { Workbook, ValueType } = require('exceljs/dist/exceljs.bare.min.js');
    const book = new Workbook();
    await book.xlsx.load(await fs.promises.readFile(file));
    const sheet = options.sheet ? book.worksheets.find(s => s.name === options.sheet) : book.worksheets[0];
    if (!sheet) throw Error(`Sheet "${options.sheet || ''}" unavailable. Available sheets: ${book.worksheets.map(s => s.name).join(', ') || '(none)'}`);
    const rows = selectIndices(options.rows, sheet.rowCount);
    const cols = selectIndices(options.cols, sheet.columnCount);
    const cells = rows.map(row => cols.map(col =>
        spreadsheetCell(sheet.getCell(row + 1, col + 1), options.styles, book.properties.date1904, ValueType.Formula)));
    return { rows, cells };
}

if (parentPort && workerData?.tableFile) {
    const { tableFile, options } = workerData;
    const read = /\.xlsx$/i.test(tableFile) ? readExcel : readCsv;
    read(tableFile, options).then(data => parentPort.postMessage({ data }),
        error => parentPort.postMessage({ error: error.message }));
}

module.exports = { parseOptions };
