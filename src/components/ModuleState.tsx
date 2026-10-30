import { Alert, Container, Locked, PageHeader } from "./ui";
import { MODULE_LABEL, type ModuleKey } from "@/lib/modules";

/** صفحهٔ بخشی که برگزارکننده بسته است (وضعیت closed) */
export function ModuleClosed({ moduleKey, title, eyebrow }: { moduleKey: ModuleKey; title: string; eyebrow?: string }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} />
      <Container>
        <h2 className="sr-only">وضعیت این بخش</h2>
        <Locked title="این بخش فعلاً بسته است" desc={`برگزارکننده بخش «${MODULE_LABEL[moduleKey]}» را بسته است. هر وقت دوباره باز شود از همین صفحه ادامه بده.`} />
      </Container>
    </>
  );
}

/** اعلان بخشی که فقط‌خواندنی است (وضعیت ro) */
export function ModuleReadOnly({ moduleKey }: { moduleKey: ModuleKey }) {
  return <Alert kind="info">بخش «{MODULE_LABEL[moduleKey]}» الان فقط‌خواندنی است؛ می‌توانی ببینی ولی تغییری ثبت نمی‌شود.</Alert>;
}
