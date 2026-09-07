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
        
        // 1. Join cells with exactly one blank line (\n\n) as a structural spacer.
        // 2. Wrap the entire payload in boundary markers to prevent the browser's 
        //    <pre> innerText from stripping trailing newlines off the final cell.
        return '# %% [pynote-start]\n' + serializedCells.join('\n\n') + '\n# %% [pynote-end]';
    }

    /**
     * Converts a .pynote.py Flatfile string into a Native PyNote Object Array
     */
    static deserializeFromFlat(payload, options = {}) {
        if (!payload) {
            return [{ type: 'code', content: '', isLocked: false, isEditing: false }];
        }
        
        // --- PROTECTIVE MARKER EXTRACTION ---
        let safePayload = payload;
        const startMarker = '# %% [pynote-start]\n'; // Note the explicit newline
        const endMarker = '\n# %% [pynote-end]';     // Note the explicit newline
        
        const startIndex = payload.indexOf(startMarker);
        const endIndex = payload.lastIndexOf(endMarker);

        // If the shell exists, slicing exactly between these indices perfectly isolates 
        // the original string, discarding the markers and their attachment newlines.
        if (startIndex > -1 && endIndex > -1 && endIndex > startIndex) {
            safePayload = payload.substring(startIndex + startMarker.length, endIndex);
        }

        if (!safePayload.includes('# %%')) {
            return [{ type: 'code', content: safePayload || '', isLocked: false, isEditing: false }];
        }
        
        const rawLines = safePayload.split(/\r?\n/);
        const cells = [];
        let currentCell = null;
        
        for (let i = 0; i < rawLines.length; i++) {
            const line = rawLines[i];
            
            // Failsafe: Ignore any mangled legacy markers that survived the extraction
            if (line.includes('[pynote-start]') || line.includes('[pynote-end]')) {
                continue; 
            }

            const markerMatch = line.match(/^#\s*%%(.*)$/);
            
            if (markerMatch) {
                if (currentCell) {
                    // Structural spacer pop
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
                
                currentCell = { type, lines: [], isLocked, isHidden, isEditing: false };
            } else {
                if (!currentCell) {
                    currentCell = { type: 'code', lines: [], isLocked: false, isHidden: false, isEditing: false };
                }
                currentCell.lines.push(line);
            }
        }
        
        if (currentCell) {
            currentCell.content = currentCell.lines.join('\n');
            cells.push(currentCell);
        }
        
        // --- The Cleanup Phase ---
        cells.forEach(c => {
            if (c.type === 'markdown' || c.type === 'text') {
                c.content = c.content.replace(/^\s*"""\s*\n?/, '').replace(/\n?\s*"""\s*$/, '');
                c.content = c.content.replace(/\n+$/, ''); 
            }
            delete c.lines; 
        });
        
        return cells.length ? cells : [{ type: 'code', content: safePayload }];
    }
}

window.NotebookFormatConverter = NotebookFormatConverter;