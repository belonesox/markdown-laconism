const vscode = require('vscode');

function activate(context) {
    return {
        extendMarkdownIt(md) {
            const plugin = require('./renderer');
            return plugin(md);
        }
    };
}

exports.activate = activate;
