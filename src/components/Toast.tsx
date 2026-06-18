import { useEffect } from "react";
import "../App.css";

export interface ToastProps {
  message: string;
  isVisible: boolean;
  duration?: number; // milliseconds
  onDismiss?: () => void;
}

export function Toast({
  message,
  isVisible,
  duration = 3000,
  onDismiss,
}: ToastProps) {
  useEffect(() => {
    if (!isVisible) return;
    
    const timer = setTimeout(() => {
      console.log(`[Toast] Auto-dismissing after ${duration}ms`);
      onDismiss?.();
    }, duration);
    
    return () => clearTimeout(timer);
  }, [isVisible, duration, onDismiss]);

  if (!isVisible) return null;

  return (
    <div className="toast-container">
      <div className="toast-message">
        {message}
      </div>
    </div>
  );
}
