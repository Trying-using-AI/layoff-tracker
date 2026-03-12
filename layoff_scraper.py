new_item = json.loads(res)
                
                # Double check company isn't already recently added
                if not any(i.get('company').lower() == new_item['company'].lower() for i in data[:20]):
                    data.append(new_item)
                    added += 1
                    print(f"Added {new_item['company']}")
        except Exception as e:
            pass
            
        time.sleep(3) # Don't overload the free API

    if added > 0:
        save_data(data)
        print("Updated JSON.")

if __name__ == "__main__":
    main()
