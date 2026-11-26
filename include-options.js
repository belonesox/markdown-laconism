function* argumentsOf(alt, kind) {
    let rest = alt.trim();
    while (rest) {
        // A quoted value can contain commas, e.g. sheet="Prices, EUR".
        const match = /^([a-z]+)(?:\s*=\s*(?:"((?:[^"]|"")*)"|([^,"]+)))?\s*(,|$)/i.exec(rest);
        if (!match) throw Error(`Invalid ${kind} option: ${rest}`);
        const key = match[1];
        const value = match[2] !== undefined ? match[2].replace(/""/g, '"') : match[3]?.trim();
        yield [key, value];
        rest = rest.slice(match[0].length).trim();
    }
}

function selection(key, value) {
    if (!value || !value.split(';').every(p => /^(?:-?\d+|(?:-?\d+)?:(?:-?\d+)?)$/.test(p.trim()))) {
        throw Error(`Invalid ${key} selection: ${value || ''}`);
    }
    return value;
}

function selectIndices(spec, length, skipMissing = false) {
    const indices = new Set();
    function index(text) {
        const n = Number(text);
        return n < 0 ? length + n : n;
    }
    for (const part of spec.split(';')) {
        const [start, end] = part.trim().split(':');
        if (end === undefined) {
            const i = index(start);
            if (i < 0 || i >= length) {
                if (skipMissing) continue;
                throw Error(`Index ${start} outside axis of length ${length}`);
            }
            indices.add(i);
        } else {
            const stop = end === '' ? length : Math.min(index(end), length);
            for (let i = Math.max(0, index(start)); i < stop; ++i) indices.add(i);
        }
    }
    return [...indices];
}

module.exports = { argumentsOf, selection, selectIndices };
