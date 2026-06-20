/** @format */

const { v2 } = require("../../utils/v2");
const axios = require("axios");

module.exports = {
  name: "userinfo",
  category: "Utility",
  cooldown: 3,
  aliases: ["ui", "whois"],
  description: "Get information about a user.",
  args: false,
  usage: "<MENTION>",
  userPerms: [],
  owner: false,
  execute: async (message, args, client, prefix) => {
    const bott = {
      false: `${client.emoji?.cross || "❌"}`,
      true: `${client.emoji?.tick || "✅"}`,
    };

    const flagg = {
      "": "None",
      Staff: "Staff",
      Partner: "Partner",
      BugHunterLevel1: "Bug Hunter",
      HypeSquad: "HypeSquad",
      BugHunterLevel2: "Bug Hunter Level 2",
      HypeSquadOnlineHouse3: "HypeSquad Balance",
      HypeSquadOnlineHouse2: "HypeSquad Brilliance",
      HypeSquadOnlineHouse1: "HypeSquad Bravery",
      PremiumEarlySupporter: "Early Supporter",
      VerifiedBot: "Verified Bot",
      VerifiedDeveloper: "Verified Developer",
      CertifiedModerator: "Certified Moderator",
      ActiveDeveloper: "Active Developer",
    };

    const mention1 =
      message.mentions.members.first() ||
      message.guild.members.cache.get(args[0]) ||
      message.member;

    const filter = { owner: message.guild.ownerId === mention1.id };

    
    const badges = mention1.user?.flags?.toArray().map((flag) => flagg[flag]) || [];

    if (mention1.avatar && mention1.avatar.startsWith("a_")) {
      badges.push(flagg["PremiumEarlySupporter"]);
    }

    const permissions = {
      Administrator: "Administrator",
      ManageGuild: "Manage Server",
      ManageRoles: "Manage Roles",
      ManageChannels: "Manage Channels",
      KickMembers: "Kick Members",
      BanMembers: "Ban Members",
      ManageNicknames: "Manage Nicknames",
      ManageEmojis: "Manage Emojis",
      ManageWebhooks: "Manage Webhooks",
      ManageMessages: "Manage Messages",
      MentionEveryone: "Mention Everyone",
      ReadMessageHistory: "Read Message History",
      MuteMembers: "Mute Members",
      DeafenMembers: "Deafen Members",
      MoveMembers: "Move Members",
      ViewAuditLog: "View Audit Log",
    };

    let acknowledgement = "Server Member";
    if (filter.owner) acknowledgement = "Server Owner";
    else if (mention1.permissions.has("Administrator")) acknowledgement = "Server Admin";
    else if (
      mention1.permissions.has([
        "ManageMessages",
        "ManageNicknames",
        "ReadMessageHistory",
        "MuteMembers",
        "DeafenMembers",
        "MoveMembers",
        "ViewAuditLog",
      ])
    ) {
      acknowledgement = "Moderator";
    }

    const nick = mention1.nickname || "None";
    
    
    const roless = mention1.roles.cache
      .filter((x) => x.id !== message.guildId && !x.managed)
      .sort((a, b) => b.position - a.position)
      .map((x) => x.toString());

    const usericon = mention1.user.displayAvatarURL({ dynamic: true });
    const mentionPermissions = mention1.permissions.toArray();
    const finalPermissions = Object.keys(permissions).filter((perm) =>
      mentionPermissions.includes(perm)
    );

    const userlol = new client.embed()
      .setTitle(`${mention1.user.username}'s Information`)
      .addFields([
        {
          name: `${client.emoji?.info || "ℹ️"} About`,
          value: `>>> **Default Name:** ${mention1.user.username}\n**Global Name:** [${mention1.user.displayName}](https://discord.com/users/${mention1.id})\n**Mention:** ${mention1}\n**ID:** \`${mention1.user.id}\`\n**Nickname:** ${nick}\n**Badges:** ${badges.length ? badges.join(" ") : "None"}\n**Created On:** <t:${Math.round(mention1.user.createdTimestamp / 1000)}:f>\n**Joined On:** <t:${Math.round(mention1.joinedTimestamp / 1000)}:f>\n**Activity:** ${mention1.presence?.activities[0] ? mention1.presence?.activities[0].name : "No Current Activity."}\n**Bot?:** ${bott[mention1.user.bot]}`,
        },
        {
          name: `${client.emoji?.role || "🏷️"} Role Info`,
          value: `>>> **Highest Role:** ${mention1.roles.highest.id === message.guild.id ? "No Highest Role." : mention1.roles.highest}\n**Hoist Role:** ${mention1.roles.hoist || "No Hoist Role."}\n**Roles:** ${roless.length > 0 ? roless.join(" ") : "No Roles."}\n**Color:** ${mention1.displayHexColor}`,
        },
        {
          name: `${client.emoji?.profile || "🪪"} Key Permissions`,
          value: `\`${finalPermissions.length ? finalPermissions.join(", ") : "None"}\``,
        },
      ]);

    if (acknowledgement) {
      userlol.addFields([
        {
          name: `${client.emoji?.search || "🔍"} Acknowledgements`,
          value: `\`${acknowledgement}\``,
        },
      ]);
    }

    userlol.setThumbnail(usericon);
    userlol.setTimestamp();

    userlol.setFooter({
      text: `Requested By: ${message.author.tag}`,
      iconURL: message.author.displayAvatarURL({ dynamic: true }),
    });

    try {
     
      const responseMessage = await message.reply(
        v2({
          embeds: [userlol],
          allowedMentions: { repliedUser: true },
        })
      );

      
      setTimeout(async () => {
        try {
          const { data } = await axios.get(
            `https://discord.com/api/users/${mention1.id}`,
            {
              headers: { Authorization: `Bot ${client.token}` },
              timeout: 2000
            }
          );
          if (data.banner) {
            const ext = data.banner.startsWith("a_") ? ".gif" : ".png";
            const bannerUrl = `https://cdn.discordapp.com/banners/${mention1.id}/${data.banner}${ext}?size=4096`;
            
            userlol.setImage(bannerUrl);
            
            
            if (responseMessage && typeof responseMessage.edit === "function") {
              await responseMessage.edit(v2({ embeds: [userlol] })).catch(() => {});
            }
          }
        } catch (err) {
          
        }
      }, 50);

      return responseMessage;
    } catch (err) {
      console.error("userinfo reply error:", err);
    }
  },
};