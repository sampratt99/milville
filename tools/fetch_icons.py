import urllib.request,urllib.parse,time,os,sys,json,re
# RS wiki inventory icons for the items that exist in RuneScape; ids with no counterpart keep the sprite
NAMES={}
for pair in open('/private/tmp/claude-501/-Users-sampratt-milville-repo/9b810c20-d8b0-4dd7-bff8-708b9f98f146/scratchpad/items.txt').read().split(';'):
    if '=' in pair:
        k,v=pair.split('=',1);NAMES[k]=v
OVERRIDE={'coins':'Coins_1000','potion_defense':'Defence potion (4)','potion_attack':'Attack potion (4)','potion_strength':'Strength potion (4)','potion_ranged':'Ranging potion (4)','potion_prayer':'Prayer potion (4)','potion_magic':'Magic potion (4)',
 'birch_logs':'Logs','birch_plank':'Plank','birch_longbow':'Maple longbow','wooden_shield':'Wooden shield','staff':'Staff','air_staff':'Staff of air','water_staff':'Staff of water','earth_staff':'Staff of earth','fire_staff':'Staff of fire','battlestaff':'Battlestaff','mystic_staff':'Mystic air staff',
 'wizard_robe_top':'Wizard robe top','wizard_robe_skirt':'Wizard robe skirt','enchanted_hat':'Enchanted hat','enchanted_top':'Enchanted top','enchanted_robe':'Enchanted robe','clue_easy':'Clue scroll (easy)','clue_medium':'Clue scroll (medium)','clue_hard':'Clue scroll (hard)','clue_elite':'Clue scroll (elite)',
 'granite_maul':'Granite maul','abyssal_whip':'Abyssal whip','dragon_sword':'Dragon longsword','red_spider_eggs':"Red spiders' eggs",'shrimps':'Shrimps','raw_shrimps':'Raw shrimps','burnt_shrimps':'Burnt shrimp','burnt_fish':'Burnt fish','uncut_sapphire':'Uncut sapphire','uncut_emerald':'Uncut emerald','uncut_ruby':'Uncut ruby','uncut_diamond':'Uncut diamond',
 'santa_hat':'Santa hat','party_hat_red':'Red partyhat','party_hat_yellow':'Yellow partyhat','party_hat_blue':'Blue partyhat','party_hat_green':'Green partyhat','party_hat_white':'White partyhat','party_hat_purple':'Purple partyhat','chefs_hat':"Chef's hat",'pumpkin_helmet':'Pumpkin','earmuffs':'Earmuffs','mirror_shield':'Mirror shield','rock_hammer':'Rock hammer','draconic_visage':'Draconic visage','basilisk_jaw':'Basilisk jaw',
 'fighting_boots':'Fighting boots','iron_nails':'Iron nails','plank':'Plank','oak_plank':'Oak plank','willow_plank':'Teak plank','amulet_attack':'Amulet of power','amulet_strength':'Amulet of strength','amulet_defence':'Amulet of defence','amulet_magic':'Amulet of magic','amulet_archery':'Amulet of accuracy','bones':'Bones','big_bones':'Big bones','small_bones':'Bones','ectoplasm':'Ectoplasm','infernal_ashes':'Infernal ashes','ring_wealth':'Ring of wealth','ring_suffering':'Ring of slaying','amulet_blood_fury':'Amulet of fury','lightbearer':'Ring of vigour','house_deed':'Deed','bronze_bar':'Bronze bar','rune_bar':'Rune bar','runite_ore':'Runite ore','shortbow':'Shortbow','oak_shortbow':'Oak shortbow','willow_shortbow':'Willow shortbow','yew_shortbow':'Yew shortbow','composite_bow':'Magic composite bow','leather_coif':'Coif','hard_leather_body':'Hardleather body','studded_body':'Studded body','studded_chaps':'Studded chaps','leather_vambraces':'Leather vambraces','frost_shard':'Ice shard','cinders':'Ashes','ember_log':'Magic logs','emberore':'Runite ore','glacial_full_helm':'Rune full helm','glacial_platebody':'Rune platebody','glacial_platelegs':'Rune platelegs','tab_rectory':'Lumbridge teleport','tab_wild':'Varrock teleport','tab_volcano':'Falador teleport','ember_brew':'Saradomin brew (4)','prayer_draught':'Super prayer (4)','raw_sardine':'Raw sardine','sardine':'Sardine','raw_trout':'Raw trout','trout':'Trout','raw_lobster':'Raw lobster','lobster':'Lobster','raw_swordfish':'Raw swordfish','swordfish':'Swordfish'}
SKIP=re.compile(r'^(mastercape_|grandcape_|cape_|hf_|food_|pet_|key_|raid_|ember_|leaf_|boots_speed|gloves_haste|amulet_(health|piety|regen)|bodkin_|halcyon|crown_|quiver_|shield_mountain|ring_(embers|warden|rector)|icicle|aurora|glens|bozeks|ricks|spencers|mishs|stolen|lost_crate|spice_pouch|fresh_herbs|coarse_salt|bland_dish|seasoned_dish|boar_head|borrowed|oven_mitts|boars_head|candy|clawed|censer|blessed|cracked|masters|proctor|crimson|gilded|hunter|scholar|sentinel|crimson_dye|gilt_dye|wailing|elemental_shield|dragon_shield|pelican|party_token|cage_token|brawlers|champions|nativity|xmas_|jellybean|mining_pouch|.*_t$|berrite|frostmaul|ashfang|emberbrand|cindermaw|molten|forgemaster|thrift|larder|blood_shard|warrant|rector_signet|obsidian|red_bead|yellow_bead|black_bead|white_bead|treasure)')
done=0;miss=[]
for k,v in NAMES.items():
    if SKIP.match(k) and k not in OVERRIDE:continue
    out='hd/icons/'+k+'.png'
    if os.path.exists(out):continue
    name=OVERRIDE.get(k,v)
    fn=name.replace(' ','_')
    url='https://runescape.wiki/images/'+urllib.parse.quote(fn)+'.png'
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Milville-HD icon fetch (private clone; sampratt99@gmail.com)'})
        data=urllib.request.urlopen(req,timeout=15).read()
        if data[:4]==b'\x89PNG':open(out,'wb').write(data);done+=1
        else:miss.append(k)
    except Exception as e:miss.append(k)
    time.sleep(0.35)
print('fetched',done,'missing',len(miss));print(' '.join(miss))
