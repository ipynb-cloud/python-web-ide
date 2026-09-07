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
                // Code cells output their content exactly as typed
                out += `# %% [code]${metaStr}\n${data.content || ''}`;
            } else {
                // Markdown cells strip trailing newlines so the """ block is clean
                const cleanContent = (data.content || '').replace(/\n+$/, '');
                out += `# %% [${type}]${metaStr}\n"""\n${cleanContent}\n"""`;
            }
            
            // Only add the visual separator gap between cells.
            // NEVER append it to the absolute final cell.
            if (index < cells.length - 1) {
                out += '\n\n';
            }
        });
        
        return out; 
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
                // The split loop artificially adds exactly 1 POSIX newline to every line parsed
                currentCell.content += line + '\n';
            }
        }
        
        if (currentCell) cells.push(currentCell);
        
        // --- The Cleanup Phase ---
        cells.forEach((c, index) => {
            if (c.type === 'markdown' || c.type === 'text') {
                // Aggressively strip quotes regardless of invisible Moodle spacing
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                // Markdown editors don't need trailing visual padding
                c.content = c.content.replace(/\n+$/, ''); 
            } else if (c.type === 'code') {
                if (index < cells.length - 1) {
                    // Middle cells had '\n\n' appended during serialization.
                    // We strip up to 2 newlines to cleanly remove this visual separator.
                    c.content = c.content.replace(/\n{1,2}$/, '');
                } else {
                    // The last cell had NOTHING appended during serialization.
                    // We ONLY strip the 1 artificial '\n' added by the parsing loop above.
                    // This preserves EVERY newline the author intentionally placed!
                    c.content = c.content.replace(/\n$/, '');
                }
            }
        });
        
        return cells.length ? cells : [{ type: 'code', content: payload }];
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;