class NotebookFormatConverter {
    /**
     * Converts a Native PyNote Object Array into a .pynote.py Flatfile string
     */
    static serializeToFlat(cells) {
        let out = '';
        cells.forEach((cell) => {
            // Support passing either a DOM Cell element or a raw data object
            const data = typeof cell.toJSON === 'function' ? cell.toJSON() : cell;
            const type = data.type;
            
            const metaObj = {};
            if (data.isLocked) metaObj.locked = true;
            if (data.isHidden) metaObj.hidden = true;
            if (type === 'code') metaObj.lang = 'python';

            const metaStr = Object.keys(metaObj).length > 0 ? ` ${JSON.stringify(metaObj)}` : '';
            
            if (type === 'code') {
                // Code cells perfectly preserve the author's internal newlines.
                // We add exactly TWO padding newlines as a delimiter.
                out += `# %% [code]${metaStr}\n${data.content || ''}\n\n`;
            } else {
                // Markdown cells strip trailing newlines so the """ block is clean
                const cleanContent = (data.content || '').replace(/\n+$/, '');
                out += `# %% [${type}]${metaStr}\n"""\n${cleanContent}\n"""\n\n`;
            }
        });
        
        // CRITICAL FIX: Instead of trimEnd(), we just slice off the very last \n 
        // from the loop's padding. This leaves exactly 1 POSIX newline at the EOF!
        return out.slice(0, -1);
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
        
        // BUFFER FIX: Hold lines in an array. Using += '\n' injects phantom newlines!
        let contentLines = []; 
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const markerMatch = line.match(/^#\s*%%(.*)$/);
            
            if (markerMatch) {
                // Save the previous cell
                if (currentCell) {
                    currentCell.content = contentLines.join('\n');
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
                contentLines = []; // Reset line buffer for the new cell
            } else {
                if (!currentCell) {
                    currentCell = { type: 'code', isLocked: false, isHidden: false, isEditing: false };
                }
                contentLines.push(line);
            }
        }
        
        if (currentCell) {
            currentCell.content = contentLines.join('\n');
            cells.push(currentCell);
        }
        
        cells.forEach((c, index) => {
            if (c.type === 'markdown' || c.type === 'text') {
                // Aggressively strip quotes regardless of invisible Moodle spacing
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                // Markdown editors don't need trailing visual padding
                c.content = c.content.replace(/\n+$/, ''); 
            } else if (c.type === 'code') {
                const isLastCell = (index === cells.length - 1);
        // --- The Cleanup Phase ---
        cells.forEach(c => {
            if (c.type === 'markdown' || c.type === 'text') {
                // Aggressively strip quotes regardless of invisible Moodle spacing
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
            } else if (c.type === 'code') {
                // Strip EXACTLY the 2 newlines artificially added by the split() + loop logic.
                // This perfectly preserves ANY extra newlines the author intentionally left!
                c.content = c.content.replace(/\n\n$/, '');
            }
        });
        
        return cells.length ? cells : [{ type: 'code', content: payload }];
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;