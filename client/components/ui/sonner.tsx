// ponytail: removed next-themes dependency in favor of native system theme
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const SUCCESS_TOAST_CLASS =
  "!bg-emerald-600 !text-white !border-emerald-700 [&_[data-close-button]]:!bg-emerald-700 [&_[data-close-button]]:!text-white [&_[data-close-button]]:!border-emerald-500 [&_[data-icon]]:!text-white";

const ERROR_TOAST_CLASS =
  "!bg-red-600 !text-white !border-red-700 [&_[data-close-button]]:!bg-red-700 [&_[data-close-button]]:!text-white [&_[data-close-button]]:!border-red-500 [&_[data-icon]]:!text-white";

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      closeButton={true}
      duration={1200}
      visibleToasts={1}
      expand={false}
      toastOptions={{
        duration: 1200,
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg max-h-48 overflow-y-auto cursor-pointer",
          success: SUCCESS_TOAST_CLASS,
          error: ERROR_TOAST_CLASS,
          warning: ERROR_TOAST_CLASS,
          description:
            "group-data-[type=success]:!text-emerald-50 group-data-[type=error]:!text-red-50 group-data-[type=warning]:!text-red-50 group-[.toast]:text-muted-foreground",
          actionButton:
            "group-data-[type=success]:!bg-white group-data-[type=success]:!text-emerald-700 group-data-[type=error]:!bg-white group-data-[type=error]:!text-red-700 group-data-[type=warning]:!bg-white group-data-[type=warning]:!text-red-700 group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
