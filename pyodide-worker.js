// pyodide-worker.js

// --- THE FIX: Use modern ES module import pointing to pyodide.mjs ---
import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/pyodide.mjs";

let pyodide = null;
let currentExecId = null;
let initPromise = null; // Prevents concurrent initializations in Singleton mode
const namespaces = {};  // Stores isolated globals for each widget

// Expose a JS function to Python for SVG matplotlib rendering
self.sendSvg = function(svgStr) {
    self.postMessage({ id: currentExecId, type: 'svg', data: svgStr });
};

self.onmessage = async function(e) {
    const msg = e.data;
    
    // Fallback to 'default' if running locally without an ID
    const widgetId = msg.widgetId || 'default'; 

    if (msg.action === 'INIT') {
        try {
            self.postMessage({ id: msg.id, type: 'status', status: 'loading' });
            
            // Initialization Latch: Ensure Pyodide only loads once
            if (!initPromise) {
                initPromise = (async () => {
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
                })();
            }
            
            await initPromise;
            self.postMessage({ id: msg.id, type: 'status', status: 'ready' });
        } catch (err) {
            self.postMessage({ id: msg.id, type: 'status', status: 'error', error: err.message });
        }
    } 
    else if (msg.action === 'EXECUTE') {
        currentExecId = msg.id;
        
        if (!namespaces[widgetId]) {
            namespaces[widgetId] = pyodide.globals.get('dict')();
        }
        const widgetNamespace = namespaces[widgetId];
        
        const enableTracing = msg.config.enableTracing !== false; 
        const maxRuntime = msg.config.maxRuntime || 15.0; 

        try {
            if (msg.code.includes('import ')) {
                await pyodide.loadPackagesFromImports(msg.code);
            }
            
            if (enableTracing) {
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
        if time.time() - _pynote_start_time > ${maxRuntime}:
            sys.settrace(None)
            raise TimeoutError("Execution stopped: Time limit (${maxRuntime}s) exceeded.")
            
    return _pynote_tracer

sys.settrace(_pynote_tracer)
                `);
            }

            let result = await pyodide.runPythonAsync(msg.code, { globals: widgetNamespace });
            
            if (enableTracing) {
                await pyodide.runPythonAsync(`sys.settrace(None)`); 
            }
            
            if (msg.config.preloadMatplotlib) {
                try { await pyodide.runPythonAsync(`import matplotlib.pyplot as plt\nif plt.get_fignums(): plt.show()`, { globals: widgetNamespace }); } catch(e) {}
            }

            if (result !== undefined) {
                widgetNamespace.set('_last_result', result);
                const reprStr = pyodide.runPython('repr(_last_result)', { globals: widgetNamespace });
                if (reprStr !== 'None') {
                    self.postMessage({ id: currentExecId, type: 'result', text: reprStr });
                }
            }
            
            self.postMessage({ id: currentExecId, type: 'success' });
        } catch (err) {
            if (enableTracing) {
                try { await pyodide.runPythonAsync(`sys.settrace(None)`); } catch(e) {}
            }
            self.postMessage({ id: currentExecId, type: 'error', error: err.toString() });
        }
        currentExecId = null;
    }
};