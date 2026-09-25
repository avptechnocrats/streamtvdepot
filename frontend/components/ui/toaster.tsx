import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        const variant = props.variant;
        return (
          <Toast key={id} {...props}>
            <div className="flex items-start gap-2.5">
              {variant === "destructive" && <AlertTriangle className="mt-0.5 h-4 w-4 text-red-700 dark:text-red-300" />}
              {variant === "success" && <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-800 dark:text-emerald-300" />}
              <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && <ToastDescription>{description}</ToastDescription>}
              </div>
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
