class NotebookFormatConverter {
    /**
     * Converts a Native PyNote Object Array into a .pynote.py Flatfile string
     */
    static serializeToFlat(cells) {
        const serializedCells = cells.map(cell => {
            const data = typeof cell.toJSON === 'function' ? cell.toJSON() : cell;
            const type = data.type;
            
            const metaObj = {};
            if (data.isLocked) metaObj.locked = true;
            if (data.isHidden) metaObj.hidden = true;
            if (type === 'code') metaObj.lang = 'python';

            const metaStr = Object.keys(metaObj).length > 0 ? ` ${JSON.stringify(metaObj)}` : '';
            
            if (type === 'code') {
                return `# %% [code]${metaStr}\n${data.content || ''}`;
            } else {
                const cleanContent = (data.content || '').replace(/\n+$/, '');
                return `# %% [${type}]${metaStr}\n"""\n${cleanContent}\n"""`;
            }
        });
        
        // Join the cells with exactly one blank line (\n\n) as a spacer
        return serializedCells.join('\n\n');
    }

    /**
     * Converts a .pynote.py Flatfile string into a Native PyNote Object Array
     */
    static deserializeFromFlat(payload, options = {}) {
        if (!payload || !payload.includes('# %%')) {
            return [{ type: 'code', content: payload || '', isLocked: false, isEditing: false }];
        }
        
        const rawLines = payload.split(/\r?\n/);
        const cells = [];
        let currentCell = null;
        
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            const markerMatch = line.match(/^#\s*%%(.*)$/);
            
            if (markerMatch) {
                if (currentCell) {
                    // We hit a new cell header. If the line immediately preceding this 
                    // header is completely empty, it is our structural spacer. Pop it!
                    if (currentCell.lines.length > 0 && currentCell.lines[currentCell.lines.length - 1] === '') {
                        currentCell.lines.pop();
                    }
                    currentCell.content = currentCell.lines.join('\n');
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
                
                // Track lines in an array instead of a messy string accumulator
                currentCell = { type, lines: [], isLocked, isHidden, isEditing: false };
            } else {
                if (!currentCell) {
                    currentCell = { type: 'code', lines: [], isLocked: false, isHidden: false, isEditing: false };
                }
                currentCell.lines.push(line);
            }
        }
        
        if (currentCell) {
            // The final cell has no cell header beneath it, so we don't pop anything.
            // Whatever trailing newlines exist (or don't) are exactly what the user authored.
            currentCell.content = currentCell.lines.join('\n');
            cells.push(currentCell);
        }
        
        // --- The Cleanup Phase ---
        cells.forEach(c => {
            if (c.type === 'markdown' || c.type === 'text') {
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                c.content = c.content.replace(/\n+$/, ''); 
            }
            // Code cells require ZERO regex cleanup now! 
            delete c.lines; 
        });
        
        return cells.length ? cells : [{ type: 'code', content: payload }];
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;