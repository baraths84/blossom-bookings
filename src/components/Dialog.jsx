import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Native dialog makes the rest of the page inert; explicit focus handling also
// supports browsers that don't focus buttons when clicked.
export default function Dialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = document.activeElement;
    dialog.showModal();
    dialog.querySelector("button")?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, []);

  function keepFocusInside(event) {
    if (event.key !== "Tab") return;
    const controls = [
      ...ref.current.querySelectorAll(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]",
      ),
    ];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={keepFocusInside}
    >
      <div className="flex items-center justify-between gap-4 border-b border-line p-6">
        <h2 id="dialog-title" className="text-xl font-semibold">
          {title}
        </h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
