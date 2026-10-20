import potholeExample from '../assets/examples/pothole.svg';
import crackExample from '../assets/examples/crack.svg';
import manholeExample from '../assets/examples/manhole.svg';

const EXAMPLE_IMAGES = {
  pothole: potholeExample,
  crack: crackExample,
  manhole: manholeExample,
};

const FALLBACK_IMAGE = potholeExample;

export function resolveDamageImage(damage) {
  const url = damage?.image_url;
  const isExample = url === 'example' || damage?.image_path === 'example';
  if (url && !isExample) return url;
  return EXAMPLE_IMAGES[damage?.damage_type] ?? FALLBACK_IMAGE;
}
