const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

module.exports = function(md, outputChannel) {

    // Логгер
    function log(msg) {
        if (!outputChannel) return;
        // Для отладки читаем конфиг, но если что-то идет не так — пишем в консоль разработчика тоже
        const config = vscode.workspace.getConfiguration('markdown-laconism');
        if (config.get('debug')) {
            outputChannel.appendLine(msg);
        }
        // console.log('[Laconism]' + msg); // Раскомментируйте, если Output пуст, и смотрите F12 -> Console
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

    // Сохраняем "предыдущий" рендер. 
    // Если мы загрузились после Mermaid/Bierner, то "предыдущий" — это их рендер.
    const previousRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        
        if (srcIndex >= 0) {
            let src = token.attrs[srcIndex][1];

            // --- 1. EXTRACT ALT (Общее для всего) ---
            let alt = token.content || '';
            // Если контент пуст, пытаемся собрать его из children (если внутри ссылки была разметка)
            if (!alt && token.children && token.children.length > 0) {
                alt = token.children.reduce((acc, child) => acc + (child.content || ''), '');
            }

            // =========================================================
            // 2. MARKDOWN INCLUDE (![](./file.md))
            // =========================================================
            // Декодируем src перед проверкой, чтобы %2Emd превратилось в .md
            let decodedSrc = src;
            try { decodedSrc = decodeURI(src); } catch(e) {}

            if (decodedSrc.toLowerCase().trim().endsWith('.md')) {
                log(`[INCLUDE START] ${decodedSrc}`);

                // 2.1. Определяем текущую директорию (Контекст)
                let currentDir = '';
                
                // env.currentDocument — это URI текущего файла, который парсится прямо сейчас
                if (env && env.currentDocument) {
                    try {
                        // env.currentDocument.fsPath работает если это объект URI
                        // Если это строка, используем как есть
                        const docPath = env.currentDocument.fsPath || env.currentDocument.path || env.currentDocument.toString();
                        currentDir = path.dirname(docPath);
                        log(`   -> Context Dir: ${currentDir}`);
                    } catch (e) {
                        log(`   -> Context Error: ${e.message}`);
                    }
                }
                
                // Fallback, если env пустой (редко, но бывает)
                if (!currentDir && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                     currentDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
                     log(`   -> Fallback to Workspace Root: ${currentDir}`);
                }

                // 2.2. Вычисляем абсолютный путь к файлу, который надо включить
                let absolutePath = decodedSrc;
                if (!path.isAbsolute(absolutePath)) {
                    absolutePath = path.join(currentDir, absolutePath);
                }

                try {
                    if (fs.existsSync(absolutePath)) {
                        const fileContent = fs.readFileSync(absolutePath, 'utf-8');
                        
                        // 2.3. ПОДГОТОВКА РЕКУРСИВНОГО ОКРУЖЕНИЯ (Fix)
                        // Мы создаем копию env, но подменяем currentDocument на путь к ВКЛЮЧАЕМОМУ файлу.
                        // Теперь внутри md.render() все относительные пути будут считаться от него.
                        const newEnv = Object.assign({}, env, {
                            currentDocument: vscode.Uri.file(absolutePath)
                        });

                        log(`   -> Recursing into: ${absolutePath}`);
                        const renderedContent = md.render(fileContent, newEnv);

                        // --- Логика обертки ---
                        if (alt && alt.trim().length > 0) {
                            let openTag = '<div';
                            if (alt.includes(':') || alt.includes(';')) {
                                openTag += ` style="${md.utils.escapeHtml(alt)}" class="markdown-included-doc"`;
                            } else {
                                openTag += ` class="${md.utils.escapeHtml(alt)}"`;
                            }
                            // Добавляем data-source для отладки
                            openTag += ` data-source="${md.utils.escapeHtml(src)}">`;
                            
                            // Добавляем \n, чтобы контент внутри не слипся с div
                            return `${openTag}\n${renderedContent}\n</div>`;
                        } else {
                            // Если ALT пуст — возвращаем контент "как есть" (Inline Include)
                            // Без div, без data-source (чтобы не мусорить в DOM)
                            log(`   -> Inline include (no wrapper)`);
                            return renderedContent;
                        }

                    } else {
                        return `<div style="color:red; border:1px solid red; padding:5px;"><b>Error:</b> Included file not found: <code>${src}</code></div>`;
                    }
                } catch (e) {
                    log(`[Error] Read error: ${e.message}`);
                    return `<div style="color:red;"><b>Include Error:</b> ${e.message}</div>`;
                }
            }

            // =========================================================
            // 2. VIDEO PROCESSING (.webm)
            // =========================================================
            
            // Сначала ALT и Размеры (для Видео и прочего)
            alt = token.content || '';
            if (!alt && token.children && token.children.length > 0) {
                alt = token.children.reduce((acc, child) => acc + (child.content || ''), '');
            }

            // --- РАЗМЕРЫ ---
            // 1. Из атрибутов (работа Bierner)
            let width = token.attrGet('width');
            let height = token.attrGet('height');
            let title = token.attrGet('title') || '';
            
            // Fallback sizes
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

            // --- WEBM -> VIDEO ---
            if (src.toLowerCase().trim().endsWith('.webm')) {
                const finalTitle = (title && title.trim()) ? title : alt;
                
                log(`[WEBM] ${src} (${width}x${height})`);

                let style = 'max-width: 100%;'; 
                if (width) style = `max-width: ${width}; width: ${width};`;
                if (height) style += ` height: ${height};`;

                const safeSrc = md.utils.escapeHtml(src);
                const safeTitle = md.utils.escapeHtml(finalTitle);
                const safeAlt = md.utils.escapeHtml(alt);

                // Добавляем data-alt для удобства отладки или CSS селекторов
                return `<video src="${safeSrc}" loop controls autoplay muted crossorigin="anonymous" style="${style}" title="${safeTitle}" data-alt="${safeAlt}">
                        Ваш браузер не поддерживает video тег.
                        </video>`;
            }
        }
        
        // Передаем управление дальше по цепочке
        return previousRender(tokens, idx, options, env, self);
    };

    // --- ОБРАБОТКА ССЫЛОК ---
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
