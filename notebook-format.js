class NotebookFormatConverter {
    /**
     * Converts a Native PyNote Object Array into a .pynote.py Flatfile string
     */
    static serializeToFlat(cells) {
        // 1. Add the protective start marker
        let out = '# %% [pynote-start]\n';
        
        cells.forEach((cell, index) => {
            const data = typeof cell.toJSON === 'function' ? cell.toJSON() : cell;
            const type = data.type;
            
            const metaObj = {};
            if (data.isLocked) metaObj.locked = true;
            if (data.isHidden) metaObj.hidden = true;
            if (type === 'code') metaObj.lang = 'python';

            const metaStr = Object.keys(metaObj).length > 0 ? ` ${JSON.stringify(metaObj)}` : '';
            
            if (type === 'code') {
                // Code cells perfectly preserve the author's internal newlines
                out += `# %% [code]${metaStr}\n${data.content || ''}`;
            } else {
                const cleanContent = (data.content || '').replace(/\n+$/, '');
                out += `# %% [${type}]${metaStr}\n"""\n${cleanContent}\n"""`;
            }
            
            if (index < cells.length - 1) {
                out += '\n\n';
            }
        });
        
        // 2. Add the protective end marker so the browser can't strip trailing newlines
        out += '\n# %% [pynote-end]';
        return out; 
    }

    /**
     * Converts a .pynote.py Flatfile string into a Native PyNote Object Array
     */
    static deserializeFromFlat(payload, options = {}) {
        if (!payload) {
            return [{ type: 'code', content: '', isLocked: false, isEditing: false }];
        }

        // --- NEW: THE EXTRACTION PHASE ---
        const startMarker = '# %% [pynote-start]';
        const endMarker = '# %% [pynote-end]';
        
        let safePayload = payload;
        const startIndex = payload.indexOf(startMarker);
        const endIndex = payload.lastIndexOf(endMarker);

        // If the protective markers exist, slice out ONLY the guaranteed-safe content between them
        if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
            safePayload = payload.substring(startIndex + startMarker.length, endIndex).replace(/^\r?\n/, '');
        }

        if (!safePayload.includes('# %%')) {
            return [{ type: 'code', content: safePayload || '', isLocked: false, isEditing: false }];
        }
        
        const lines = safePayload.split(/\r?\n/);
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
        cells.forEach((c, index) => {
            if (c.type === 'markdown' || c.type === 'text') {
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                c.content = c.content.replace(/\n+$/, ''); 
            } else if (c.type === 'code') {
                if (index < cells.length - 1) {
                    // Strip the \n\n visual separator from middle cells
                    c.content = c.content.replace(/\n{1,2}$/, '');
                } else {
                    // Because the end marker protected our trailing whitespace from the browser,
                    // we ONLY need to strip the ONE artificial newline added by the loop above.
                    // Every intentional blank line the user typed will be perfectly preserved!
                    c.content = c.content.replace(/\n$/, '');
                }
            }
        });
        
        return cells.length ? cells : [{ type: 'code', content: safePayload }];
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;