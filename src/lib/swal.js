import Swal from "sweetalert2";

const base = {
  buttonsStyling: true,
  confirmButtonColor: "#15803d",
  cancelButtonColor: "#64748b",
  customClass: {
    popup: "rounded-2xl",
    title: "text-slate-900",
    htmlContainer: "text-slate-600",
    confirmButton: "rounded-lg px-5 py-2.5 font-semibold",
    cancelButton: "rounded-lg px-5 py-2.5 font-semibold",
  },
};

export function showAlert({ title, text, icon = "info", confirmButtonText = "OK" }) {
  return Swal.fire({
    ...base,
    title,
    text,
    icon,
    confirmButtonText,
  });
}

export async function showConfirm({
  title = "Are you sure?",
  text,
  confirmButtonText = "Continue",
  cancelButtonText = "Cancel",
  icon = "warning",
  confirmButtonColor,
}) {
  const result = await Swal.fire({
    ...base,
    title,
    text,
    icon,
    showCancelButton: true,
    reverseButtons: true,
    focusCancel: true,
    confirmButtonText,
    cancelButtonText,
    ...(confirmButtonColor ? { confirmButtonColor } : {}),
  });
  return result.isConfirmed;
}

export async function showPrompt({
  title,
  text,
  inputLabel,
  inputPlaceholder = "",
  inputValue = "",
  confirmButtonText = "Save",
  cancelButtonText = "Cancel",
  minLength = 5,
  maxLength = 500,
}) {
  const result = await Swal.fire({
    ...base,
    title,
    text,
    input: "textarea",
    inputLabel,
    inputPlaceholder,
    inputValue,
    inputAttributes: { maxlength: String(maxLength), "aria-label": inputLabel || title },
    showCancelButton: true,
    reverseButtons: true,
    focusCancel: true,
    confirmButtonText,
    cancelButtonText,
    inputValidator: (value) => {
      const length = String(value || "").trim().length;
      if (length < minLength || length > maxLength) {
        return `Please enter between ${minLength} and ${maxLength} characters.`;
      }
      return undefined;
    },
  });
  return result.isConfirmed ? result.value : null;
}

export function showSuccess(title, text) {
  return showAlert({ title, text, icon: "success" });
}

export function showError(title, text) {
  return showAlert({ title, text, icon: "error" });
}
