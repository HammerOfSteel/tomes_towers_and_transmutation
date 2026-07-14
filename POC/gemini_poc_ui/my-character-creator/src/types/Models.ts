export interface CharacterConfig {
    skinColor: number;
    dressColor: number;
    hairColor: number;
    pattern: 'None' | 'Stripes' | 'Dots';
    hairStyle: 'Buns' | 'Bob';
}

export const DEFAULT_CONFIG: CharacterConfig = {
    skinColor: 0xffd1b3,
    dressColor: 0xe91e63,
    hairColor: 0x5d4037,
    pattern: 'None',
    hairStyle: 'Buns'
};