import urllib.request,urllib.parse,time,os
M={'attack':'Attack-icon','strength':'Strength-icon','defense':'Defence-icon','hitpoints':'Constitution-icon','woodcutting':'Woodcutting-icon','mining':'Mining-icon','smithing':'Smithing-icon','fishing':'Fishing-icon','cooking':'Cooking-icon','firemaking':'Firemaking-icon','prayer':'Prayer-icon','slayer':'Slayer-icon','ranged':'Ranged-icon','magic':'Magic-icon','agility':'Agility-icon','construction':'Construction-icon',
 'bag':'Backpack_icon','tab_equip':'Worn_Equipment_icon','tab_spell':'Magic_abilities_icon','tab_combat':'Melee_icon','friends':'Friends_List_icon','quest':'Quest_icon','wrench':'Options_icon','log':'Achievements_icon','book':'Skills_icon','question':'Notes_icon','helm':'Worn_Equipment_icon','map':'Minimap_icon',
 'pr_burst_strength':'Burst_of_Strength','pr_clarity':'Clarity_of_Thought','pr_eagle_eye':'Eagle_Eye','pr_hawk_eye':'Hawk_Eye','pr_improved_reflexes':'Improved_Reflexes','pr_incredible_reflexes':'Incredible_Reflexes','pr_mystic_lore':'Mystic_Lore','pr_mystic_might':'Mystic_Might','pr_mystic_will':'Mystic_Will','pr_protect_magic':'Protect_from_Magic','pr_protect_melee':'Protect_from_Melee'}
for pot,nm in [('attack','Attack_potion'),('strength','Strength_potion'),('defense','Defence_potion'),('ranged','Ranging_potion'),('magic','Magic_potion'),('prayer','Prayer_potion')]:
    for d in (1,2,3,4):M['pot_%s_%d'%(pot,d)]='%s_(%d)'%(nm,d)
ok=[];miss=[]
for k,fn in M.items():
    out='hd/ui/'+k+'.png'
    if os.path.exists(out):continue
    url='https://runescape.wiki/images/'+urllib.parse.quote(fn)+'.png'
    try:
        req=urllib.request.Request(url,headers={'User-Agent':'Milville-HD icon fetch (private clone; sampratt99@gmail.com)'})
        data=urllib.request.urlopen(req,timeout=15).read()
        if data[:4]==b'\x89PNG':open(out,'wb').write(data);ok.append(k)
        else:miss.append(k)
    except Exception as e:miss.append(k)
    time.sleep(0.3)
print('ok',len(ok));print('miss',miss)
