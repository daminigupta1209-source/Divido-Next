type EscHandler = () => void;

class EscManager {
  private handlers: EscHandler[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown, { capture: true });
    }
  }

  /**
   * Registers an Escape key close handler.
   * Returns an unregister function to clean up when the modal/overlay unmounts or closes.
   */
  public register(handler: EscHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      const active = document.activeElement;
      if (active && active.tagName === 'INPUT' && (active as HTMLInputElement).type === 'date') {
        return;
      }
      if (this.handlers.length > 0) {
        // Prevent all other event listeners on window or DOM elements from receiving this Escape keypress
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Call the topmost registered handler
        const topHandler = this.handlers[this.handlers.length - 1];
        topHandler();
      }
    }
  };
}

export const escManager = new EscManager();
