const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const ts = require('typescript');
const { buildClientSchema, getIntrospectionQuery, parse, validate } = require('graphql');

function collectDocuments() {
	const documents = [];
	function walk(directory) {
		for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
			const file = path.join(directory, item.name);
			if (item.isDirectory()) walk(file);
			else if (/\.tsx?$/.test(file)) {
				const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
				function visit(node) {
					if (ts.isTaggedTemplateExpression(node) && node.tag.getText(source) === 'gql' && ts.isNoSubstitutionTemplateLiteral(node.template)) {
						documents.push({ file, name: ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : 'inline', query: node.template.text });
					}
					if (ts.isCallExpression(node) && node.expression.getText(source) === 'gql' && node.arguments.length === 1 && (ts.isNoSubstitutionTemplateLiteral(node.arguments[0]) || ts.isStringLiteral(node.arguments[0]))) {
						documents.push({ file, name: ts.isVariableDeclaration(node.parent) ? node.parent.name.getText(source) : 'inline', query: node.arguments[0].text });
					}
					if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'query' && (ts.isNoSubstitutionTemplateLiteral(node.initializer) || ts.isStringLiteral(node.initializer))) {
						documents.push({ file, name: 'inline-upload', query: node.initializer.text });
					}
					ts.forEachChild(node, visit);
				}
				visit(source);
			}
		}
	}
	walk(path.resolve(__dirname, '../apollo'));
	walk(path.resolve(__dirname, '../libs/components'));
	return documents;
}

function schemaRequest(endpoint) {
	return new Promise((resolve, reject) => {
		const body = JSON.stringify({ query: getIntrospectionQuery() });
		const req = http.request(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 15000 }, (response) => {
			let data = '';
			response.on('data', (chunk) => { data += chunk; });
			response.on('end', () => {
				try {
					const result = JSON.parse(data);
					if (result.errors || !result.data) throw new Error(JSON.stringify(result.errors || result));
					resolve(buildClientSchema(result.data));
				} catch (error) { reject(error); }
			});
		});
		req.on('timeout', () => req.destroy(new Error('Schema request timed out')));
		req.on('error', reject);
		req.end(body);
	});
}

async function main() {
	const schema = await schemaRequest('http://localhost:3007/graphql');
	const documents = collectDocuments();
	let failures = 0;
	for (const document of documents) {
		const errors = validate(schema, parse(document.query));
		for (const error of errors) {
			failures++;
			console.error(path.relative(process.cwd(), document.file) + ' [' + document.name + ']: ' + error.message);
		}
	}
	if (failures) throw new Error(failures + ' GraphQL validation errors');
	console.log('Validated ' + documents.length + ' frontend GraphQL documents against the local backend schema (read only).');
}

module.exports = { collectDocuments };
if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
