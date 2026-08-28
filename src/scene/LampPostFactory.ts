import * as THREE from 'three';

export function makeLampPost(): THREE.Group {
  const g = new THREE.Group();

  const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2620 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.4, 6), postMat);
  post.position.y = 0.7;
  g.add(post);

  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffcc77,
    emissive: 0xffaa44,
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });
  const lantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), lanternMat);
  lantern.position.y = 1.42;
  g.add(lantern);

  const light = new THREE.PointLight(0xffaa55, 0, 5); // starts off — day
  light.position.y = 1.42;
  g.add(light);

  return g;
}
