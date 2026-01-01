module.exports = function(md) {
    // Сохраняем оригинальное правило рендеринга изображений
    const defaultRender = md.renderer.rules.image || function(tokens, idx, options, env, self) {
        return self.renderToken(tokens, idx, options);
    };

    // Переопределяем правило
    md.renderer.rules.image = function(tokens, idx, options, env, self) {
        const token = tokens[idx];
        const srcIndex = token.attrIndex('src');
        
        if (srcIndex >= 0) {
            const src = token.attrs[srcIndex][1];
            
            // Проверяем расширение файла (регистронезависимо)
            if (src.toLowerCase().endsWith('.webm')) {
                // Извлекаем alt текст, если он нужен (но для видео обычно не критично)
                const alt = token.content;

                // Возвращаем HTML тег video
                // Добавлен style="max-width: 100%" чтобы видео не вылезало за границы превью
                return `<video src="${src}" loop autoplay muted crossorigin="anonymous" style="max-width: 100%;" title="${alt}">
                        Ваш браузер не поддерживает video тег.
                        </video>`;
            }
        }

        // Если это не webm, используем стандартный рендерер
        return defaultRender(tokens, idx, options, env, self);
    };
    return md;
};
