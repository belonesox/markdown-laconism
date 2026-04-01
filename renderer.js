const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

module.exports = function(md, outputChannel) {

    // Логгер
    function log(msg) {
        if (!outputChannel) return;
        const config = vscode.workspace.getConfiguration('markdown-laconism');
        if (config.get('debug')) {
            outputChannel.appendLine(msg);
        }
    }

    log('[Renderer] Initializing custom rules...');

    // Fallback парсер размеров
    function parseSizeFallback(str) {
        if (!str) return null;
        let decoded = str;
        try { decoded = decodeURI(str); } catch (e) {}
        
        const regex = /(?:\s|%20)*=(\d+(?:%|px|em|rem|vw|vh)?)?x(\d+(?:%|px|em|rem|vw|vh)?)?(?:\s|%20)*$/;
        const match = decoded.match(regex);
        if (match) {
            return { width: match[1], height: match[2], cleanStr: decoded.replace(regex, '') };
        }
        return null;
    }

    const previousRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        
        if (srcIndex >= 0) {
            let src = token.attrs[srcIndex][1];

            // --- 1. EXTRACT ALT ---
            let alt = token.content || '';
            if (!alt && token.children && token.children.length > 0) {
                alt = token.children.reduce((acc, child) => acc + (child.content || ''), '');
            }

            let decodedSrc = src;
            try { decodedSrc = decodeURI(src); } catch(e) {}

            // --- 2. FIX ДЛЯ REMOTE: Извлекаем реальный путь из URL ---
            // VS Code Remote подменяет локальные пути на ссылки vscode-resource.vscode-cdn.net
            if (/^https?:\/\/vscode-remote/i.test(decodedSrc) && decodedSrc.toLowerCase().includes('.md')) {
                const pathMatch = decodedSrc.match(/\.net(\/.*\.md)$/i) || decodedSrc.match(/\.com(\/.*\.md)$/i);
                if (pathMatch) {
                    log(`[REMOTE DECODE] Extracted: ${pathMatch[1]}`);
                    decodedSrc = pathMatch[1];
                }
            }

            // =========================================================
            // 3. MARKDOWN INCLUDE (![](./file.md) или ![](/docs/file.md))
            // =========================================================
            if (decodedSrc.toLowerCase().trim().endsWith('.md')) {
                log(`[PROCESS] ${decodedSrc}`);

                // 3.1. Определяем директорию ТЕКУЩЕГО документа
                let currentDir = '';
                
                if (env && env.currentDocument) {
                    try {
                        const docPath = env.currentDocument.fsPath || env.currentDocument.path || env.currentDocument.toString();
                        // Проверяем, что это не урл, а путь
                        if (docPath.includes('/') || docPath.includes('\\')) {
                            currentDir = path.dirname(docPath);
                            log(`   -> Context (Env): ${currentDir}`);
                        }
                    } catch (e) {}
                }

                if (!currentDir && vscode.window.activeTextEditor) {
                    try {
                        const activeDoc = vscode.window.activeTextEditor.document;
                        if (activeDoc && activeDoc.uri) {
                            currentDir = path.dirname(activeDoc.uri.fsPath);
                            log(`   -> Context (ActiveEditor): ${currentDir}`);
                        }
                    } catch (e) {}
                }
                
                // 3.2. Определяем корень проекта (Workspace Root)
                let workspaceRoot = env.rootPath;
                if (!workspaceRoot && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                    workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
                }
                
                const rootPath = workspaceRoot || currentDir;

                // 3.3. Вычисляем итоговый путь к ВКЛЮЧАЕМОМУ файлу
                let absolutePath = decodedSrc;
                const looksAbsolute = absolutePath.startsWith('/') || /^[a-zA-Z]:\\/.test(absolutePath);

                if (looksAbsolute) {
                    // Проверяем, существует ли файл по абсолютному пути как есть (после Remote Decode)
                    if (fs.existsSync(absolutePath)) {
                        log(`   -> Resolved System Absolute Path: ${absolutePath}`);
                    } else {
                        // Если нет, предполагаем, что это путь от корня проекта (Workspace Root)
                        const joinedPath = path.join(rootPath, absolutePath.replace(/^[\/\\]+/, ''));
                        if (fs.existsSync(joinedPath)) {
                            absolutePath = joinedPath;
                            log(`   -> Resolved Workspace Path: ${absolutePath}`);
                        } else {
                            // Оставляем joinedPath для вывода красивой ошибки
                            absolutePath = joinedPath;
                        }
                    }
                } else if (!path.isAbsolute(absolutePath)) {
                    // Относительный путь (./file.md или file.md)
                    absolutePath = path.join(currentDir, absolutePath);
                    log(`   -> Resolved Relative Path: ${absolutePath}`);
                }

                try {
                    if (fs.existsSync(absolutePath)) {
                        log(`   -> Found on disk: ${absolutePath}`);
                        const fileContent = fs.readFileSync(absolutePath, 'utf-8');
                        const includedFileDir = path.dirname(absolutePath);

                        // Создаем окружение для рекурсии
                        const newEnv = Object.assign({}, env || {}, {
                            currentDocument: vscode.Uri.file(absolutePath),
                            rootPath: rootPath
                        });

                        // Парсим включенный файл
                        const tokensInside = md.parse(fileContent, newEnv);

                        // Исправляем пути картинок и видео внутри трансклюзии
                        tokensInside.forEach(t => {
                            if (t.type === 'inline' && t.children) {
                                t.children.forEach(child => {
                                    if (child.type === 'image') {
                                        const originalImgSrc = child.attrGet('src');
                                        
                                        if (originalImgSrc && !originalImgSrc.toLowerCase().endsWith('.md') && !/^(https?|vscode-resource):/i.test(originalImgSrc)) {
                                            let absImgPath = originalImgSrc;
                                            try { absImgPath = decodeURI(originalImgSrc); } catch(e){}

                                            if (!path.isAbsolute(absImgPath)) {
                                                absImgPath = path.resolve(includedFileDir, absImgPath);
                                            }

                                            // Путь относительно ROOT документа
                                            const relToRoot = path.relative(rootPath, absImgPath);
                                            const normalizedPath = relToRoot.split(path.sep).join('/');
                                            child.attrSet('src', normalizedPath);
                                        }
                                    }
                                });
                            }
                        });

                        // Рендерим исправленные токены
                        const renderedContent = md.renderer.render(tokensInside, md.options, newEnv);

                        // Логика обертки
                        if (alt && alt.trim().length > 0) {
                            let openTag = '<div';
                            if (alt.includes(':') || alt.includes(';')) {
                                openTag += ` style="${md.utils.escapeHtml(alt)}" class="markdown-included-doc"`;
                            } else {
                                openTag += ` class="${md.utils.escapeHtml(alt)}"`;
                            }
                            openTag += ` data-source="${md.utils.escapeHtml(src)}">`;
                            return `${openTag}\n${renderedContent}\n</div>`;
                        } else {
                            return renderedContent;
                        }

                    } else {
                        log(`   -> ERROR: Not found: ${absolutePath}`);
                        // Если это все же был внешний URL, отдаем стандартному рендеру
                        if (/^https?:/i.test(src)) {
                            return previousRender(tokens, idx, options, env, self);
                        }
                        return `<div style="color: var(--vscode-errorForeground); border: 1px solid var(--vscode-errorForeground); padding: 8px; border-radius: 4px;"><strong>Markdown Laconism Error:</strong> Included file not found: <code>${md.utils.escapeHtml(decodedSrc)}</code></div>`;
                    }
                } catch (e) {
                    log(`   -> Exception: ${e.message}`);
                    return `<div style="color: var(--vscode-errorForeground);"><strong>Markdown Laconism Include Error:</strong> ${md.utils.escapeHtml(e.message)}</div>`;                    
                }
            }

            // =========================================================
            // 4. VIDEO PROCESSING (.webm)
            // =========================================================
            let width = token.attrGet('width');
            let height = token.attrGet('height');
            let title = token.attrGet('title') || '';
            
            if (!width && !height) {
                const sizeInSrc = parseSizeFallback(src);
                if (sizeInSrc) {
                    width = sizeInSrc.width;
                    height = sizeInSrc.height;
                    src = sizeInSrc.cleanStr.trim();
                } else if (title) {
                    const sizeInTitle = parseSizeFallback(title);
                    if (sizeInTitle) {
                        width = sizeInTitle.width;
                        height = sizeInTitle.height;
                        title = sizeInTitle.cleanStr;
                    }
                }
            }

            if (src.toLowerCase().trim().endsWith('.webm')) {
                const finalTitle = (title && title.trim()) ? title : alt;
                
                log(`[WEBM] ${src}`);

                let style = 'max-width: 100%;'; 
                if (width) style = `max-width: ${width}; width: ${width};`;
                if (height) style += ` height: ${height};`;

                const safeSrc = md.utils.escapeHtml(src);
                const safeTitle = md.utils.escapeHtml(finalTitle);
                const safeAlt = md.utils.escapeHtml(alt);

                return `<video src="${safeSrc}" loop controls autoplay muted crossorigin="anonymous" style="${style}" title="${safeTitle}" data-alt="${safeAlt}">
                Your browser does not support the video tag.
                </video>`;
            }
        }
        
        return previousRender(tokens, idx, options, env, self);
    };

    // =========================================================
    // 5. ОБРАБОТКА ССЫЛОК (Code Inline ./path)
    // =========================================================
    const defaultCodeInline = md.renderer.rules.code_inline || function(tokens, idx, options, env, self) {
         return '<code' + self.renderAttrs(tokens[idx]) + '>' + 
                md.utils.escapeHtml(tokens[idx].content) + 
                '</code>';
    };

    md.renderer.rules.code_inline = function(tokens, idx, options, env, self) {
        const rawContent = tokens[idx].content;
        if (rawContent.startsWith('./')) {
            let href = rawContent;
            if (href.toLowerCase().endsWith('.md')) {
                href = href.substring(0, href.length - 3) + '.html';
            }
            const linkText = md.utils.escapeHtml(rawContent);
            return `<code><a href="${href}" class='cnig-filelink'>${linkText}</a></code>`;
        }
        return defaultCodeInline(tokens, idx, options, env, self);
    };

    return md;
};