const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

module.exports = function(md, outputChannel) {

    // Логгер
    function log(msg) {
        if (!outputChannel) return;
        
        // Читаем конфиг каждый раз, чтобы можно было включить лог без перезагрузки
        const config = vscode.workspace.getConfiguration('markdown-laconism');
        if (config.get('debug')) {
            outputChannel.appendLine(msg);
        }
    }

    // Fallback парсер размеров (если imsize не справился или отключен)
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

    // Сохраняем предыдущий рендерер (обычно это image из плагина bierner)
    const previousRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    md.renderer.rules.image = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        
        if (srcIndex >= 0) {
            let src = token.attrs[srcIndex][1];
            
            // =========================================================
            // 1. MARKDOWN INCLUDE (![](./file.md))
            // =========================================================
            if (src.toLowerCase().trim().endsWith('.md')) {
                log(`[INCLUDE DETECTED] Src: ${src}`);

                // 1. Определяем базовый путь текущего документа
                let currentDir = '';
                
                // VS Code передает путь к документу в env.currentDocument (обычно это URI)
                if (env && env.currentDocument) {
                    try {
                        // env.currentDocument.fsPath работает если это объект URI
                        // Если это строка, используем как есть
                        const docPath = env.currentDocument.fsPath || env.currentDocument.path || env.currentDocument.toString();
                        currentDir = path.dirname(docPath);
                        log(`   -> Base Context: ${currentDir}`);
                    } catch (e) {
                        log(`   -> Error resolving base path: ${e.message}`);
                    }
                }

                // Если не удалось через env, пробуем через workspace (менее надежно для ./ путей)
                if (!currentDir && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                     currentDir = vscode.workspace.workspaceFolders[0].uri.fsPath;
                     log(`   -> Fallback to Workspace Root: ${currentDir}`);
                }

                // 2. Вычисляем абсолютный путь к включаемому файлу
                let absolutePath = src;
                if (!path.isAbsolute(src)) {
                    // Если путь относительный, склеиваем с папкой текущего файла
                    absolutePath = path.join(currentDir, src);
                }

                // 3. Читаем и рендерим
                try {
                    log(`   -> Reading file: ${absolutePath}`);
                    if (fs.existsSync(absolutePath)) {
                        const fileContent = fs.readFileSync(absolutePath, 'utf-8');
                        
                        // ВАЖНО: Рендерим контент рекурсивно!
                        // Мы создаем новый env, чтобы не загрязнять текущий, 
                        // но передаем текущий путь как базу для вложенных инклюдов.
                        // (Хотя env.currentDocument в VS Code может переопределяться самим экстеншеном)
                        
                        // Добавляем класс-обертку, чтобы можно было стилизовать включенные куски
                        return `<div class="markdown-included-doc" data-source="${src}">
                                ${md.render(fileContent, env)}
                                </div>`;
                    } else {
                        log(`   -> File not found: ${absolutePath}`);
                        return `<p style="color:red; border:1px solid red; padding:5px;"><b>Error:</b> Included file not found: <code>${src}</code></p>`;
                    }
                } catch (e) {
                    log(`   -> Read Error: ${e.message}`);
                    return `<p style="color:red;"><b>Include Error:</b> ${e.message}</p>`;
                }
            }


            // =========================================================
            // 2. VIDEO PROCESSING (.webm)
            // =========================================================
            
            // Сначала ALT и Размеры (для Видео и прочего)
            let alt = token.content || '';
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
