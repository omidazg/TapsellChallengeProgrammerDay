"use client";

import { useState } from "react";
import Image from "next/image";
import { coverUrl } from "@/lib/product";

export function Gallery({ images, seed }: { images: string[]; seed: string }) {
  const list = images.length > 0 ? images : [coverUrl([], seed)];
  const [active, setActive] = useState(0);

  return (
    <div className="anim-rise">
      <div className="relative w-full aspect-[8/5] rounded-3xl overflow-hidden border border-brand-mist">
        <Image src={list[active]} alt="تصویر محصول" fill sizes="800px" className="object-cover" unoptimized priority />
      </div>
      {list.length > 1 && (
        <div className="mt-3 grid grid-cols-5 sm:grid-cols-6 gap-2">
          {list.map((url, idx) => (
            <button
              key={url + idx}
              type="button"
              onClick={() => setActive(idx)}
              className={`relative aspect-square rounded-xl overflow-hidden border-2 transition ${idx === active ? "border-brand-red" : "border-transparent opacity-80 hover:opacity-100"}`}
            >
              <Image src={url} alt={`تصویر ${idx + 1}`} fill sizes="120px" className="object-cover" unoptimized />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
