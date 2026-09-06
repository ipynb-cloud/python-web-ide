// pyodide-worker.js
importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

let pyodide = null;
let currentExecId = null;

// Expose a JS function to Python for SVG matplotlib rendering
self.sendSvg = function(svgStr) {
    self.postMessage({ id: currentExecId, type: 'svg', data: svgStr });
};

self.onmessage = async function(e) {
    const msg = e.data;

    if (msg.action === 'INIT') {
        try {
            self.postMessage({ id: msg.id, type: 'status', status: 'loading' });
            
            pyodide = await loadPyodide({
                stdout: (text) => self.postMessage({ id: currentExecId, type: 'stdout', text }),
                stderr: (text) => self.postMessage({ id: currentExecId, type: 'stderr', text })
            });

            if (msg.config.preloadMatplotlib) {
                self.postMessage({ id: msg.id, type: 'status', status: 'loading-packages' });
                await pyodide.loadPackage(['matplotlib', 'numpy']);
                
                // Setup matplotlib headless SVG rendering
                const setupCode = `
import matplotlib
matplotlib.use('svg')
import matplotlib.pyplot as plt
import io
import js
import sys

def _custom_show():
    # Pause the timeout tracer while Matplotlib renders to avoid unfair timeouts
    _prev_trace = sys.gettrace()
    sys.settrace(None)
    
    try:
        buf = io.BytesIO()
        plt.savefig(buf, format='svg', bbox_inches='tight')
        buf.seek(0)
        js.sendSvg(buf.read().decode('utf-8'))
        plt.close()
    finally:
        sys.settrace(_prev_trace)

plt.show = _custom_show
`;
                await pyodide.runPythonAsync(setupCode);
            }
            
            self.postMessage({ id: msg.id, type: 'status', status: 'ready' });
        } catch (err) {
            self.postMessage({ id: msg.id, type: 'status', status: 'error', error: err.message });
        }
    } 
    else if (msg.action === 'EXECUTE') {
        currentExecId = msg.id;
        try {
            // OPTIMIZATION 1: Only run the heavy AST parser if "import" is actually in the code
            if (msg.code.includes('import ')) {
                await pyodide.loadPackagesFromImports(msg.code);
            }
            
            // OPTIMIZATION 2: Tick-based tracing. 
            // Checking time.time() is expensive in Wasm. Only check it every 100 instructions.
            await pyodide.runPythonAsync(`
import sys
import time
_pynote_start_time = time.time()
_pynote_tick = 0

def _pynote_tracer(frame, event, arg):
    if not frame.f_code.co_filename.startswith("<"):
        return None
        
    global _pynote_tick
    _pynote_tick += 1
    
    if _pynote_tick > 100:
        _pynote_tick = 0
        if time.time() - _pynote_start_time > 15.0:
            sys.settrace(None)
            raise TimeoutError("Execution stopped: Time limit (15s) exceeded. Infinite loop detected.")
            
    return _pynote_tracer

sys.settrace(_pynote_tracer)
            `);

            let result = await pyodide.runPythonAsync(msg.code);
            
            // Cleanup trace
            await pyodide.runPythonAsync(`sys.settrace(None)`); 
            
            // Flush any un-shown matplotlib plots
            if (msg.config.preloadMatplotlib) {
                try { await pyodide.runPythonAsync(`import matplotlib.pyplot as plt\nif plt.get_fignums(): plt.show()`); } catch(e) {}
            }

            if (result !== undefined) {
                pyodide.globals.set('_last_result', result);
                const reprStr = pyodide.runPython('repr(_last_result)');
                if (reprStr !== 'None') {
                    self.postMessage({ id: currentExecId, type: 'result', text: reprStr });
                }
            }
            
            self.postMessage({ id: currentExecId, type: 'success' });
        } catch (err) {
            try { await pyodide.runPythonAsync(`sys.settrace(None)`); } catch(e) {}
            self.postMessage({ id: currentExecId, type: 'error', error: err.toString() });
        }
        currentExecId = null;
    }
};
