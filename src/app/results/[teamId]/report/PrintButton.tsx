"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="btn-primary print:hidden">
      چاپ / ذخیره به PDF
    </button>
  );
}
