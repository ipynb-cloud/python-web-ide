class NotebookFormatConverter {
    /**
     * Converts a Native PyNote Object Array into a .pynote.py Flatfile string
     */
    static serializeToFlat(cells) {
        let out = '';
        cells.forEach((cell, index) => {
            // Support passing either a DOM Cell element or a raw data object
            const data = typeof cell.toJSON === 'function' ? cell.toJSON() : cell;
            const type = data.type;
            
            const metaObj = {};
            if (data.isLocked) metaObj.locked = true;
            if (data.isHidden) metaObj.hidden = true;
            if (type === 'code') metaObj.lang = 'python';

            const metaStr = Object.keys(metaObj).length > 0 ? ` ${JSON.stringify(metaObj)}` : '';
            
            if (type === 'code') {
                // Code cells preserve the author's internal newlines
                out += `# %% [code]${metaStr}\n${data.content || ''}\n\n`;
            } else {
                // Markdown cells strip trailing newlines so the """ block is clean
                const cleanContent = (data.content || '').replace(/\n+$/, '');
                out += `# %% [${type}]${metaStr}\n"""\n${cleanContent}\n"""\n\n`;
            }
        });
        
        // Ensure the file ends cleanly with exactly 1 newline (POSIX standard)
        return out.trimEnd() + '\n';
    }

    /**
     * Converts a .pynote.py Flatfile string into a Native PyNote Object Array
     */
    static deserializeFromFlat(payload, options = {}) {
        if (!payload || !payload.includes('# %%')) {
            return [{ type: 'code', content: payload || '', isLocked: false, isEditing: false }];
        }
        
        const lines = payload.split(/\r?\n/);
        const cells = [];
        let currentCell = null;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const markerMatch = line.match(/^#\s*%%(.*)$/);
            
            if (markerMatch) {
                if (currentCell) {
                    cells.push(currentCell);
                }
                
                const metaRaw = markerMatch[1].trim();
                let type = 'code';
                let isLocked = false;
                let isHidden = false;
                
                const typeMatch = metaRaw.match(/\[([a-zA-Z]+)\]/);
                if (typeMatch) type = typeMatch[1];
                
                const jsonMatch = metaRaw.match(/({.*})/);
                if (jsonMatch) {
                    try {
                        const metaObj = JSON.parse(jsonMatch[1].replace(/'/g, '"'));
                        if (metaObj.locked) isLocked = true;
                        if (metaObj.hidden) isHidden = true;
                    } catch (e) {
                        console.warn("PyNote Parser: Invalid JSON metadata ->", jsonMatch[1]);
                    }
                }

                if (options.lockAllMarkdown && type === 'markdown') {
                    isLocked = true;
                }
                
                currentCell = { type, content: '', isLocked, isHidden, isEditing: false };
            } else {
                if (!currentCell) {
                    currentCell = { type: 'code', content: '', isLocked: false, isHidden: false, isEditing: false };
                }
                currentCell.content += line + '\n';
            }
        }
        
        if (currentCell) cells.push(currentCell);
        
        // --- The Cleanup Phase ---
        cells.forEach(c => {
            if (c.type === 'markdown' || c.type === 'text') {
                // Aggressively strip quotes regardless of invisible Moodle spacing!
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                // Markdown editors don't need trailing visual padding
                c.content = c.content.replace(/\n+$/, ''); 
            } else if (c.type === 'code') {
                // Strip EXACTLY the 1 or 2 newlines added by the serialization gap.
                // This perfectly preserves any EXTRA empty lines the author intentionally left!
                c.content = c.content.replace(/\n{1,2}$/, '');
            }
        });
        
        return cells.length ? cells : [{ type: 'code', content: payload }];
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;