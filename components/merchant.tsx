/* eslint-disable jsx-a11y/prefer-tag-over-role -- SVG is a cropped native sprite with an accessible image label. */
'use client';
import { useId } from 'react';
import { PalaceCutout } from '@/components/palace-cutout';
import merchantArt from '@/game/merchant-art.json';
import { SkinIcon } from '@/components/skin-icon';
import { MERCHANT_TOPICS } from '@/game/merchant';
import type { Offer } from '@/game/engine';

export function MerchantArt() {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="merchant-art"
      viewBox={merchantArt.bounds.join(' ')}
      role="img"
      aria-label="Савва — усатый торговец в оливковом пальто с мешком товаров"
    >
      <defs>
        <PalaceCutout
          id={`merchant-alpha-${id}`}
          bounds={[0, 0, merchantArt.width, merchantArt.height]}
        />
      </defs>
      <image
        filter={`url(#merchant-alpha-${id})`}
        href={merchantArt.src}
        width={merchantArt.width}
        height={merchantArt.height}
      />
    </svg>
  );
}
export function ShopPrice({ offer }: { offer: Offer }) {
  return (
    <span className={`shop-price ${offer.discount ? 'sale-price' : ''}`}>
      {offer.discount && (
        <>
          <span className="sale-badge">−{offer.discount}%</span>
          <s aria-label="Старая цена">{offer.baseCost}</s>
        </>
      )}
      <span className="current-price">
        <SkinIcon name="coin" size={22} />
        <b>{offer.cost}</b>
      </span>
    </span>
  );
}
export function Merchant({
  text,
  onTalk,
  busy,
  archive = false,
}: {
  text: string;
  onTalk: (text: string) => void;
  busy: boolean;
  archive?: boolean;
}) {
  return (
    <section className="merchant" aria-label="Разговор с торговцем">
      <div className="merchant-portrait">
        <MerchantArt />
      </div>
      <div className="merchant-conversation">
        <strong className="merchant-name">
          Савва <span>старьёвщик</span>
        </strong>
        <p className="merchant-speech" aria-live="polite">
          «{text}»
        </p>
        <div className="merchant-questions">
          {MERCHANT_TOPICS.map((topic) => (
            <button
              key={topic.id}
              disabled={busy}
              onClick={() =>
                onTalk(
                  archive && topic.id === 'road'
                    ? 'Дальше удильщики и утонувший каталог. В насосной можно запустить насос за 30 монет: приливы станут слабее на 2. Перед Хранителем есть сухой причал. Кляксы смывай фокусом, а воду отводи матчем в отмеченной строке.'
                    : topic.answer,
                )
              }
            >
              {topic.question}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
