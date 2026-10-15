import logoMark from '../assets/logo-mark.png';

const SIZES = {
  sm: { tile: 'size-7 rounded-md p-0.5', image: 'size-6' },
  md: { tile: 'size-9 rounded-lg p-1', image: 'size-7' },
};

/**
 * The product logo on a white tile, so its navy and green read on any surface (light, dark, or
 * the sign-in gradient). Decorative: the product name is always written next to it.
 */
export function BrandMark({ size = 'sm', className = '' }) {
  const s = SIZES[size];
  return (
    <span
      className={`flex shrink-0 items-center justify-center bg-white shadow-raised ring-1 ring-black/5 ${s.tile} ${className}`}
    >
      <img src={logoMark} alt="" width="128" height="128" className={s.image} />
    </span>
  );
}
