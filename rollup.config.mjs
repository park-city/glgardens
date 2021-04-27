import path from 'path';
import url from 'url';
import typescript from '@rollup/plugin-typescript';
import { babel } from '@rollup/plugin-babel';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodeGlobals from 'rollup-plugin-node-globals';
import nodeBuiltins from 'rollup-plugin-node-builtins';
import glslify from 'rollup-plugin-glslify';
import { terser } from 'rollup-plugin-terser';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const prod = process.env.NODE_ENV === 'production';

export default {
    input: 'src/index.ts',
    preserveSymlinks: true,
    preserveEntrySignatures: false,
    plugins: [
        glslify({ compress: prod }),
        typescript({}),
        babel({
            babelHelpers: 'bundled',
            plugins: [
                '@babel/plugin-proposal-class-properties',
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
