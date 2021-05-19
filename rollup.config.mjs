import fs from 'fs';
import path from 'path';
import url from 'url';
import util from 'util';
import typescript from '@rollup/plugin-typescript';
import { babel } from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodeGlobals from 'rollup-plugin-node-globals';
import nodeBuiltins from 'rollup-plugin-node-builtins';
import glslify from 'rollup-plugin-glslify';
import { terser } from 'rollup-plugin-terser';
import { applyFancyMacros } from './glsl-fancy-macros.mjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';

export default {
    input: 'src/index.ts',
    preserveSymlinks: true,
    preserveEntrySignatures: false,
    plugins: [
        glslInclude(),
        glslify({ compress: prod }),
        typescript({}),
        babel({
            babelHelpers: 'bundled',
            plugins: [
                '@babel/plugin-proposal-class-properties',
                '@babel/plugin-proposal-export-default-from',
            ],
            include: ['src/**'],
        }),
        commonjs(),
        nodeGlobals(),
        nodeBuiltins({ preferBuiltins: true }),
        nodeResolve(),
        prod && terser(),
    ].filter(x => x),
    output: {
        dir: 'target',
        format: 'esm',
        chunkFileNames: '[name].js',
    },
};

function glslInclude() {
    const GLSL_EXTS = ['.vert', '.frag', '.glsl'];
    const readFile = util.promisify(fs.readFile);

    async function transform(code, id) {
        const newCode = [];
        for (const line of code.split('\n')) {
            if (line.startsWith('#include')) {
                const m = line.match(/^#include "((?:[^\\"]|\\.)+)"$/);
                if (!m) throw new Error(`GLSL syntax error: ${line} does not match include format`);
                let moduleName = m[1].replace(/\\(.)/, '$1');
                if (!moduleName.match(/^(?:\.\/|\.\.\/)/)) moduleName = './' + moduleName;
                const resolved = await this.resolve(moduleName, id);
                if (!resolved) throw new Error(`${id}:\nCould not resolve #include "${moduleName}"`);
                this.addWatchFile(resolved.id);
                const imported = (await readFile(resolved.id)).toString();
                const transformed = await transform.apply(this, [imported, resolved.id]);
                newCode.push(transformed);
            } else {
                newCode.push(line);
            }
        }
        return newCode.join('\n');
    }

    return {
        name: 'glsl-include',
        async transform(code, id) {
            if (!GLSL_EXTS.find(e => id.endsWith(e))) return null;
            const result = await transform.apply(this, [code, id]);
            return applyFancyMacros(result);
        },
    };
}
