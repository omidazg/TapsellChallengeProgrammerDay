"use client";

import { useState } from "react";
import Image from "next/image";
import { coverUrl, isLocalUploadUrl } from "@/lib/product-utils";

export function Gallery({ images, seed }: { images: string[]; seed: string }) {
  const list = images.length > 0 ? images : [coverUrl([], seed)];
  const [active, setActive] = useState(0);

  return (
    <div className="anim-rise">
      <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist">
        <Image src={list[active]} alt="تصویر محصول" fill sizes="800px" className="object-cover" unoptimized={!isLocalUploadUrl(list[active])} priority />
      </div>
      {list.length > 1 && (
        <div className="mt-3 flex sm:grid sm:grid-cols-6 gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
          {list.map((url, idx) => (
            <button
              key={url + idx}
              type="button"
              onClick={() => setActive(idx)}
              className={`relative size-16 sm:size-auto sm:aspect-square shrink-0 rounded-xl overflow-hidden border-2 transition ${idx === active ? "border-brand-red" : "border-transparent opacity-80 hover:opacity-100"}`}
            >
              <Image src={url} alt={`تصویر ${idx + 1}`} fill sizes="120px" className="object-cover" unoptimized={!isLocalUploadUrl(url)} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
