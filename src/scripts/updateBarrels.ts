import * as fs from 'fs';
import * as path from 'path';

/**
 * Update Barrels — Automatically keeps index.ts files updated.
 */
export function updateBarrels(directory: string) {
    const files = fs.readdirSync(directory);
    const exports = files
        .filter(f => f !== 'index.ts' && (f.endsWith('.ts') || f.endsWith('.tsx')))
        .map(f => `export * from './${f.replace(/\.tsx?$/, '')}';`)
        .join('\n');

    const indexPath = path.join(directory, 'index.ts');
    fs.writeFileSync(indexPath, exports + '\n');
    console.log(`[BarrelTool] Updated ${indexPath}`);
}

if (require.main === module) {
    const target = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
    updateBarrels(target);
}
