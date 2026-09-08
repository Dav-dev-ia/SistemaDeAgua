import { useEffect, useRef } from 'react';

/**
 * Modal accesible: focus trap, retorno de foco, cierre con Escape,
 * bloqueo de scroll del body y semántica ARIA (dialog/aria-modal).
 */
export default function Modal({ id, title, onClose, children, footer, size }) {
  const overlayRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    previousFocus.current = document.activeElement;
    const overlay = overlayRef.current;
    document.body.style.overflow = 'hidden';

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusables = () => Array.from(overlay.querySelectorAll(focusableSelector));
    const focusFirst = () => {
      const f = focusables();
      if (f.length > 0) f[0].focus();
    };
    focusFirst();

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const f = focusables();
        if (f.length === 0) return;
        const firstEl = f[0];
        const lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (previousFocus.current && typeof previousFocus.current.focus === 'function') {
        previousFocus.current.focus();
      }
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`modal-content${size ? ` modal-${size}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 id={id}>{title}</h3>
          <button type="button" className="btn btn-icon btn-outline" onClick={onClose} aria-label="Cerrar diálogo">
            <i className="bi bi-x-lg" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}