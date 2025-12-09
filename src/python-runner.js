// Python 코드 실행 및 입력 처리 모듈
export function setupPythonRunner() {
  const runBtn = document.getElementById("run-code-btn");
  const clearBtn = document.getElementById("clear-output-btn");
  const outputLog = document.getElementById("output-log");
  const outputStatus = document.getElementById("output-status");
  const inputContainer = document.getElementById("input-container");
  const pythonInput = document.getElementById("python-input");

  window._python_input_queue = [];
  let isWaitingForInput = false;

  // Pyodide 로딩 상태에 따라 실행 버튼 활성화 제어
  if (typeof window.pyodideReady === 'undefined' || !window.pyodideReady) {
    runBtn.disabled = true;
    outputStatus.textContent = 'Pyodide 로드 중...';
    const waitInterval = setInterval(() => {
      if (window.pyodideReady) {
        runBtn.disabled = false;
        outputStatus.textContent = '대기 중';
        clearInterval(waitInterval);
      }
    }, 200);
  } else {
    runBtn.disabled = false;
    outputStatus.textContent = '대기 중';
  }

  runBtn.addEventListener("click", async () => {
    if (typeof window.pyodideReady === 'undefined' || !window.pyodideReady) {
      outputLog.innerHTML = '<div class="output-error">Pyodide가 아직 로드 중입니다. 잠시 후 다시 시도해 주세요.</div>';
      return;
    }

    const code = window.editorView?.state.doc.toString() ?? "";
    if (!code.trim()) {
      outputLog.innerHTML = '<div class="output-error">코드를 입력해 주세요.</div>';
      return;
    }

    runBtn.disabled = true;
    outputLog.innerHTML = '<div class="output-info">코드 실행 중...</div>';
    outputStatus.textContent = '실행 중...';
    inputContainer.style.display = 'none';
    window._python_input_queue = [];
    isWaitingForInput = false;

    try {
      const pyodide = window.pyodide;

      // 커스텀 input() 함수 정의 - JavaScript와 상호작용
      const customInputFunc = `
import asyncio

_input_buffer = []

def input(prompt=''):
    if prompt:
        print(prompt, end='', flush=True)
    
    # JavaScript에서 입력값이 들어올 때까지 대기
    # 동기적으로 처리하기 위해 전역 변수 사용
    import js
    js.window._input_waiting = True
    js.window.document.getElementById("input-container").style.display = "block"
    input_field = js.window.document.getElementById("python-input")
    input_field.value = ""
    input_field.focus()
    
    # 입력 대기 (busy-wait, 하지만 짧은 시간)
    max_wait = 500  # 5초 제한
    wait_count = 0
    while len(js.window._python_input_queue) == 0 and wait_count < max_wait:
        import time
        time.sleep(0.01)
        wait_count += 1
    
    if len(js.window._python_input_queue) > 0:
        user_input = str(js.window._python_input_queue.pop(0))
        print(user_input, flush=True)
        return user_input
    else:
        return ""
`;

      // 사용자 코드 이스케이프
      const escapedCode = code
        .replace(/\\/g, '\\\\')
        .replace(/"""/g, '\\"\\"\\"');

      const pythonCode = `
import sys
from io import StringIO

_old_stdout = sys.stdout
_old_stderr = sys.stderr
sys.stdout = StringIO()
sys.stderr = StringIO()

try:
    exec("""${customInputFunc}""")
    exec("""${escapedCode}""")
    _result = sys.stdout.getvalue()
    _error = sys.stderr.getvalue()
    if _error:
        _result = _result + "\\n[stderr]\\n" + _error
except Exception as e:
    import traceback
    _result = traceback.format_exc()
finally:
    sys.stdout = _old_stdout
    sys.stderr = _old_stderr

_result
`;

      const output_text = pyodide.runPython(pythonCode).toString();

      if (output_text.trim()) {
        outputLog.innerHTML = `<pre class="output-text">${escapeHtml(output_text)}</pre>`;
      } else {
        outputLog.innerHTML = '<div class="output-info">출력 결과가 없습니다.</div>';
      }

      outputStatus.textContent = '✓ 실행 완료';
      inputContainer.style.display = 'none';
    } catch (err) {
      console.error("Python 실행 오류:", err);
      outputLog.innerHTML = `<pre class="output-error">${escapeHtml(err.toString())}</pre>`;
      outputStatus.textContent = '✗ 오류 발생';
      inputContainer.style.display = 'none';
    } finally {
      runBtn.disabled = false;
    }
  });

  // 입력 필드 Enter 이벤트
  pythonInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const userInput = pythonInput.value;
      window._python_input_queue.push(userInput);
      pythonInput.value = '';
    }
  });

  // 초기화 버튼
  clearBtn.addEventListener("click", () => {
    outputLog.innerHTML = '';
    outputStatus.textContent = '코드 실행 후 결과가 표시됩니다';
    inputContainer.style.display = 'none';
    pythonInput.value = '';
    window._python_input_queue = [];
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

