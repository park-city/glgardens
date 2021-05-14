const path = require('path');
const { promisify } = require('util');
const fs = require('fs');
const deps = require('glslify-deps');
const bundle = require('glslify-bundle');

const readFile = promisify(fs.readFile);

module.exports = function glslLoader(source) {
    const callback = this.async();
    const loader = this;

    async function transform(code, id) {
        const newCode = [];
        for (let line of code.split('\n')) {
            line = line.trim();
            if (line.startsWith('#include')) {
                const m = line.match(/^#include "((?:[^\\"]|\\.)+)"$/);
                if (!m) throw new Error(`GLSL syntax error: ${line} does not match include format`);
                let moduleName = m[1].replace(/\\(.)/, '$1');
                if (!moduleName.match(/^(?:\.\/|\.\.\/)/)) moduleName = './' + moduleName;
                const resolved = path.resolve(path.join(path.dirname(id), moduleName));
                if (!resolved) throw new Error(`${id}:\nCould not resolve #include "${moduleName}"`);
                const imported = (await readFile(resolved)).toString();
                loader.addDependency(resolved);
                const transformed = await transform.apply(this, [imported, resolved]);
                newCode.push(transformed);
            } else {
                newCode.push(line);
            }
        }
        return newCode.join('\n');
    }

    transform(source, this.resourcePath).then(result => new Promise((resolve, reject) => {
        deps().inline(result, path.dirname(this.resourcePath), (err, tree) => {
            if (err) return reject(err);
            tree && tree.forEach(file => !file.entry && this.addDependency(file.file));
            resolve(bundle(tree));
        });
    })).then(result => {
        callback(null, `export default ${JSON.stringify(result)}`);
    }).catch(error => {
        callback(error);
    });
}
