// Ensure the registry exists before trying to register
if (window.MarkdownWidgetRegistry) {
    
    window.MarkdownWidgetRegistry.register('csv', function(preElement, codeText) {
        const rows = codeText.split('\n').map(row => row.split(','));
        
        let tableHTML = `<div class="overflow-x-auto my-4"><table class="w-full text-sm text-left border-collapse border border-slate-300">`;
        
        rows.forEach((row, i) => {
            tableHTML += `<tr class="${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}">`;
            row.forEach(cell => {
                if (i === 0) tableHTML += `<th class="border border-slate-300 bg-slate-100 p-2 font-bold">${cell.trim()}</th>`;
                else tableHTML += `<td class="border border-slate-300 p-2 text-slate-700">${cell.trim()}</td>`;
            });
            tableHTML += `</tr>`;
        });
        
        tableHTML += `</table></div>`;
        
        // Replace the <pre> block with the new table
        preElement.outerHTML = tableHTML;
        
        // Return true to tell the router this block was successfully handled!
        return true; 
    });

}