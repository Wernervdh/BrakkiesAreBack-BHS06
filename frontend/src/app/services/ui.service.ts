import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'success' | 'error';
}

export interface ConfirmRequest {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  resolve: (ok: boolean) => void;
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

  confirm(options: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
    this.confirmRequest()?.resolve(false);
    return new Promise((resolve) => {
      this.confirmRequest.set({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Confirm',
        danger: options.danger ?? false,
        resolve: (ok) => {
          this.confirmRequest.set(null);
          resolve(ok);
        }
      });
    });
  }
}
