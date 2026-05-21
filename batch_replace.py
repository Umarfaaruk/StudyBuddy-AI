import re
import os

files = [
    'src/pages/quiz/QuizPage.tsx',
    'src/pages/quiz/QuizResults.tsx'
]

for file_path in files:
    if not os.path.exists(file_path):
        continue
        
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace <Card ...> with new style
    content = re.sub(r'<Card className=\"(.*?)\">', r'<div className=\"bg-white rounded-2xl shadow-sm border border-gray-100 p-6 \1\">', content)
    content = re.sub(r'<Card>', r'<div className=\"bg-white rounded-2xl shadow-sm border border-gray-100 p-6\">', content)
    content = re.sub(r'</Card>', r'</div>', content)
    
    # Replace CardHeader
    content = re.sub(r'<CardHeader(.*?)[>]', r'<div className=\"mb-4\" \1>', content)
    content = re.sub(r'</CardHeader>', r'</div>', content)
    
    # Replace CardTitle
    content = re.sub(r'<CardTitle(.*?)[>]', r'<h3 className=\"font-bold text-gray-900 text-lg\" \1>', content)
    content = re.sub(r'</CardTitle>', r'</h3>', content)
    
    # Replace CardDescription
    content = re.sub(r'<CardDescription(.*?)[>]', r'<p className=\"text-xs text-gray-400 mt-0.5\" \1>', content)
    content = re.sub(r'</CardDescription>', r'</p>', content)
    
    # Replace CardContent
    content = re.sub(r'<CardContent(.*?)[>]', r'<div \1>', content)
    content = re.sub(r'</CardContent>', r'</div>', content)
    
    # Replace CardFooter
    content = re.sub(r'<CardFooter(.*?)[>]', r'<div className=\"mt-4\" \1>', content)
    content = re.sub(r'</CardFooter>', r'</div>', content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print('Updated', file_path)
