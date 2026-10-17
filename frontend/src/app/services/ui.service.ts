import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export type ChoiceResult = 'confirm' | 'alternative' | 'cancel';

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  /** Optional safer alternative, shown as the highlighted first button. */
  alternativeLabel?: string;
  resolve: (result: ChoiceResult) => void;
}

/** App-wide toasts and confirmation dialogs (rendered by UiOverlayComponent). */
@Injectable({ providedIn: 'root' })
export class UiService {
  readonly toasts = signal<Toast[]>([]);
  readonly confirmRequest = signal<ConfirmRequest | null>(null);
  private nextId = 1;

  toast(text: string, kind: Toast['kind'] = 'info'): void {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, text, kind }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 6000 : 3500);
  }

  error(text: string): void {
    this.toast(text, 'error');
  }

  success(text: string): void {
    this.toast(text, 'success');
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }

  async confirm(options: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    return (await this.choose(options)) === 'confirm';
  }

  /** Confirmation with an optional safer alternative button. */
  choose(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    alternativeLabel?: string;
  }): Promise<ChoiceResult> {
    this.confirmRequest()?.resolve('cancel');
    return new Promise((resolve) => {
      this.confirmRequest.set({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        danger: options.danger ?? false,
        alternativeLabel: options.alternativeLabel,
        resolve: (result) => {
          this.confirmRequest.set(null);
          resolve(result);
        }
      });
    });
  }
}
