import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
import json
import os
import time
from datetime import datetime
import re
import google.generativeai as genai

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    print("API Key not found. Exiting.")
    exit(1)

genai.configure(api_key=API_KEY)
# Using Gemini 2.5 Flash for fast, accurate text analysis
model = genai.GenerativeModel('gemini-2.5-flash')

JSON_FILE_PATH = 'layoffs.json'

def load_data():
    if os.path.exists(JSON_FILE_PATH):
        with open(JSON_FILE_PATH, 'r', encoding='utf-8') as f:
            try:
                return json.load(f)
            except Exception:
                return []
    return []

def save_data(data):
    # Sort data by date, newest first
    data.sort(key=lambda x: x.get('date', '1970-01-01'), reverse=True)
    with open(JSON_FILE_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

def main():
    print("Fetching historical news for the last 6 months...")
    
    # Use a stronger modern browser User-Agent so Google doesn't block the bot
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    
    # FIX: Use multiple simpler queries to bypass Google News RSS boolean rejections
    # Pools multiple feeds to guarantee hundreds of results
    queries = [
        'tech layoffs when:180d',
        'startup layoffs when:180d',
        'corporate job cuts when:180d'
    ]
    
    all_articles = []
    seen_links = set()

    for query in queries:
        encoded_query = urllib.parse.quote(query)
        rss_url = f'https://news.google.com/rss/search?q={encoded_query}&hl=en-US&gl=US&ceid=US:en'
        
        try:
            req = urllib.request.Request(rss_url, headers=headers)
            with urllib.request.urlopen(req) as response:
                root = ET.fromstring(response.read())
                
                # Extract items and avoid duplicates across the different searches
                for item in root.findall('.//item'):
                    link = item.find('link').text
                    if link not in seen_links:
                        seen_links.add(link)
                        all_articles.append(item)
        except Exception as e:
            print(f"Failed to fetch news for query '{query}': {e}")

    data = load_data()
    added = 0

    # Read top 150 unique articles combined from all queries
    articles = all_articles[:150]
    print(f"Found {len(articles)} unique articles. Scanning...")

    for article in articles:
        title = article.find('title').text
        link = article.find('link').text
        
        # Get the article snippet/description
        description_node = article.find('description')
        raw_desc = description_node.text if description_node is not None else ""
        
        # Strip HTML tags out of the Google News description so AI can read plain text
        clean_desc = re.sub(r'<[^>]+>', ' ', raw_desc).strip()
        
        # Get publication date to pass to AI for accurate historical dating
        pub_date_node = article.find('pubDate')
        pub_date = pub_date_node.text if pub_date_node is not None else datetime.now().strftime("%Y-%m-%d")
        
        # Check if we already processed this exact article link in our database
        if any(item.get('link') == link for item in data):
            continue

        # Extract source name from title (Google News appends it after a dash)
        title_text = title if title else ""
        source_name = title_text.split(' - ')[-1] if ' - ' in title_text else 'News'

        # Upgraded Analyst Prompt (We DO NOT ask AI for the link to prevent broken/hallucinated URLs)
        prompt = f"""
        You are a Data Analyst tracking corporate layoffs. Read the following news title and clean article snippet:
        
        Title: {title}
        Snippet: {clean_desc}
        Publication Date: {pub_date}
        
        TASK:
        Evaluate the text carefully. Does it announce a specific company laying off employees or cutting jobs?
        - If YES: Extract the data. Look closely at BOTH the title and snippet. For "number", you MUST find the actual integer count of employees laid off (e.g., 1600, 4000). If it mentions a percentage (e.g., "10% of 10,000 employees"), calculate the exact number (1000). If the exact numerical layoff count is completely missing or unclear, return null. Do NOT guess.
        - If NO (e.g., general economy news, hiring news, or opinion pieces): Return the exact word "null".
        
        Return ONLY valid JSON matching this schema (no markdown formatting, no backticks, no extra text):
        {{"company": "Company Name", "date": "YYYY-MM-DD", "number": 1000, "roles": "Roles impacted (or 'Unknown')"}}
        """
        
        try:
            res = model.generate_content(prompt).text.strip()
            
            if res != "null" and "{" in res:
                # Clean up markdown if AI added it
                if res.startswith("```json"):
                    res = res[7:-3]
                elif res.startswith("```"):
                    res = res[3:-3]
                
                new_item = json.loads(res)
                company_name = new_item.get('company', '')
                
                if company_name and company_name.lower() != "unknown":
                    # Better Duplicate Checking & Grouping Links
                    is_duplicate = False
                    for existing_item in data:
                        if existing_item.get('company', '').lower() == company_name.lower():
                            try:
                                # If the same company has a layoff reported within 14 days, treat it as the same event
                                date_str_exist = existing_item.get('date', '1970-01-01')[:10]
                                date_str_new = new_item.get('date', '1970-01-01')[:10]
                                date_exist = datetime.strptime(date_str_exist, "%Y-%m-%d")
                                date_new = datetime.strptime(date_str_new, "%Y-%m-%d")
                                
                                if abs((date_exist - date_new).days) <= 14:
                                    is_duplicate = True
                                    
                                    # 1. Improve the numbers if the new article has exact counts and the old one didn't
                                    old_num = existing_item.get('number')
                                    new_num = new_item.get('number')
                                    if new_num and isinstance(new_num, int) and (not old_num or old_num < new_num):
                                        existing_item['number'] = new_num
                                        print(f"🔄 Updated {company_name} with better layoff count: {new_num}")
                                        
                                    # 2. Append new link to the row (up to 3 links)
                                    if 'links' not in existing_item:
                                        existing_item['links'] = [{'source': existing_item.get('source', 'News'), 'url': existing_item.get('link', '')}]
                                    
                                    if not any(l['url'] == link for l in existing_item['links']):
                                        if len(existing_item['links']) < 3:
                                            existing_item['links'].append({'source': source_name, 'url': link})
                                            
                                    break
                            except Exception:
                                # If date parsing fails for some reason, ignore duplicate check
                                pass
                    
                    if not is_duplicate:
                        # Setup new entry
                        new_item['id'] = int(time.time() * 1000)
                        new_item['link'] = link  # Keep primary link for older UI
                        new_item['source'] = source_name
                        new_item['links'] = [{'source': source_name, 'url': link}]
                        
                        data.append(new_item)
                        added += 1
                        print(f"✅ Extracted Layoff: {company_name} | Roles: {new_item.get('roles')} | Count: {new_item.get('number')}")
                        
        except Exception as e:
            # Silently skip AI parsing errors to keep the loop moving
            pass
            
        # Sleep for 4 seconds to ensure we stay under the 15 Requests Per Minute free tier limit
        time.sleep(4) 

    if added > 0:
        save_data(data)
        print(f"Successfully updated JSON with {added} new records.")
    else:
        print("No new layoffs found to add.")

if __name__ == "__main__":
    main()
