export function hasUnresolvedPlaceholder(text:string){return /\[(?:insert|add|your|link|brief|name|встав|ссылк)[^\]]*\]|\{\{[^}]+\}\}|<(?:insert|brief|link)[^>]*>|\b(?:TBD|TODO)\b/i.test(text)}
