import { terser } from 'rollup-plugin-terser';

export default {
  input: 'src/nano-cache.ts',
  output: [
    {
      file: 'dist/nano-cache.cjs.js',
      format: 'cjs',
      exports: 'default',
      sourcemap: true
    },
    {
      file: 'dist/nano-cache.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  plugins: [
    terser({
      compress: { passes: 2 },
      format: { comments: false }
    })
  ]
};
