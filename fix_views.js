const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'js', 'views');
const files = fs.readdirSync(viewsDir);

files.forEach(file => {
    if (file.endsWith('.js')) {
        const filePath = path.join(viewsDir, file);
        let content = fs.readFileSync(filePath, 'utf8');

        // Find function or const declarations for renderXYZ
        const renderMatches = [...content.matchAll(/(?:function|const|let)\s+(render[A-Za-z0-9_]+)\s*(?:=|[(])/g)];

        let additions = '';
        renderMatches.forEach(match => {
            const funcName = match[1];
            // Check if it's already exported to window
            if (!content.includes(`window.${funcName} = ${funcName}`)) {
                additions += `\nwindow.${funcName} = ${funcName};\n`;
            }
        });

        if (additions) {
            fs.writeFileSync(filePath, content + additions);
            console.log(`Updated ${file} with -> ${additions.trim().replace(/\n/g, ' ')}`);
        }
    }
});
