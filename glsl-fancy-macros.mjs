import { createHash } from 'crypto';

function substIdents(code, substitutions) {
    return code.replace(/\b([a-zA-Z_][\w_]+)\b/g, (s, id) => substitutions[id] || s);
}

function cryptoLocals(code, seed) {
    const hash = createHash('sha256');
    hash.update(seed);
    const substitutions = {};
    code.replace(/^\s*#.+/mg, '').replace(/([a-zA-Z]\w+)\s+([a-zA-Z_][\w+_]+)(\s*=\s*.+?;)/g, (_, ty, name, def) => {
        hash.update(name);
        substitutions[name] = name + '_' + hash.copy().digest().toString('hex').substr(0, 10);
    });
    return substIdents(code, substitutions);
}

// add #pragma inline on the line before any void function call to inline it
export function applyFunctionInlining(code) {
    const fnDefs = {};
    {
        const re = /(void)\s+((?!layout\b)[\w_]+)\s*\(((?:.|\n|\r)*?)\)\s*{/;
        let rest = code;
        let m;
        while ((m = rest.match(re))) {
            const ret = m[1];
            const name = m[2];
            let rawArgs = m[3].split(',');
            const warnings = [];
            const args = rawArgs.filter(x => x).map(arg => {
                const m = arg.trim().match(/^(?:(in|out|inout)\s+)?(\w+)\s+(\w+)$/);
                if (!m) {
                    warnings.push('Could not parse GLSL argument: ' + arg.trim());
                    return ['', null];
                }
                const access = m[1];
                const type = m[2];
                const name = m[3];
                return { access, type, name };
            });

            rest = rest.substr(m.index + m[0].length);
            let contents = '';
            let depth = 1;
            while (rest.length && depth) {
                let c = rest[0];
                if (c === '{') depth++;
                else if (c === '}') depth--;
                if (depth > 0) contents += c;
                rest = rest.substr(1);
            }

            fnDefs[name] = { ret, args, name, contents, warnings };
        }
    }

    const inlineRe = /^\s*#pragma inline\s+(\w+)\s*\(((?:.|\n|\r)*?)\)\s*;/gm;
    let i = 0;
    return code.replace(inlineRe, (s, name, params) => {
        if (!fnDefs[name]) {
            throw new Error(`#pragma inline: could not find void ${name}`);
        }
        for (const warning of fnDefs[name].warnings) console.warn(warning);
        fnDefs[name].warnings = [];

        params = params.split(',').map(x => x.trim());
        if (params.length > fnDefs[name].args.length) throw new Error(`#pragma inline: too many parameters in call to ${name}`);

        const substitutions = {};
        for (let i = 0; i < fnDefs[name].args.length; i++) {
            const arg = fnDefs[name].args[i].name;
            const param = params[i];
            if (!param) {
                throw new Error(`#pragma inline: missing parameter for argument ${arg} in call to ${name}`);
            }
            substitutions[arg] = '(' + param + ')';
        }

        let contents = cryptoLocals(substIdents(fnDefs[name].contents, substitutions), (i++).toString());
        return `// -- begin expansion of inline call to ${name} --\n${contents}\n// -- end expansion of inline call to ${name} --`;
    });
}

export function applyFancyMacros(code) {
    return applyFunctionInlining(code);
}
