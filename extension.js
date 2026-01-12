const vscode = require('vscode');

// Создаем канал вывода (он будет виден в списке Output)
const outputChannel = vscode.window.createOutputChannel("Markdown Laconism");

function activate(context) {
    // Пишем стартовое сообщение, только если дебаг включен
    const config = vscode.workspace.getConfiguration('markdown-laconism');
    if (config.get('debug')) {
        outputChannel.appendLine('[Main] Extension Activated v0.2.0');
    }

    return {
        extendMarkdownIt(md) {
            const plugin = require('./renderer');
            return plugin(md, outputChannel);
        }
    };
}

exports.activate = activate;
